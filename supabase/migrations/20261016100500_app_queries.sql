-- =============================================================================
-- Queries behind the products, product detail and transactions pages.
--
-- Table-valued and SECURITY INVOKER: Row Level Security applies, and the Data
-- API can sort, page and count their results. Derived product figures follow
-- deriveProductRow() in src/lib/analytics/reference.ts.
-- =============================================================================

-- Escapes LIKE wildcards so user search text matches literally.
create or replace function private.escape_like(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_');
$$;
grant execute on function private.escape_like(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Product catalogue with figures for a period. Every product is listed, also
-- those without sales in the period (their figures are zero).
--   p_filter: 'active' (default), 'archived', 'missing_cost', 'loss', 'all'
-- -----------------------------------------------------------------------------
create or replace function public.report_product_catalog(
  p_store_id uuid,
  p_from date,
  p_to date,
  p_search text default null,
  p_filter text default 'active'
)
returns table (
  product_id uuid,
  sku text,
  name text,
  unit_cost_e4 bigint,
  price_minor bigint,
  archived boolean,
  source text,
  created_at timestamptz,
  units bigint,
  gross_sales bigint,
  discounts bigint,
  refunds bigint,
  shipping_charged bigint,
  cogs bigint,
  lines_without_cost integer,
  shipping_costs bigint,
  transaction_fees bigint,
  ad_spend bigint,
  net_sales bigint,
  net_revenue bigint,
  contribution_margin bigint,
  contribution_margin_rate double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (
    select * from public.report_product_breakdown(p_store_id, p_from, p_to)
  ),
  base as (
    select p.id, p.sku, p.name, p.unit_cost_e4, p.price_minor, p.archived_at is not null as archived, p.source, p.created_at,
           coalesce(b.units, 0)::bigint as units,
           coalesce(b.gross_sales, 0)::bigint as gross_sales,
           coalesce(b.discounts, 0)::bigint as discounts,
           coalesce(b.refunds, 0)::bigint as refunds,
           coalesce(b.shipping_charged, 0)::bigint as shipping_charged,
           case when coalesce(b.lines_without_cost, 0) > 0 then null else coalesce(b.cogs, 0) end::bigint as cogs,
           coalesce(b.lines_without_cost, 0)::integer as lines_without_cost,
           coalesce(b.shipping_costs, 0)::bigint as shipping_costs,
           coalesce(b.transaction_fees, 0)::bigint as transaction_fees,
           coalesce(b.ad_spend, 0)::bigint as ad_spend
    from public.products p
    left join b on b.product_id = p.id
    where p.store_id = p_store_id
      and (
        coalesce(btrim(p_search), '') = ''
        or p.name ilike '%' || private.escape_like(btrim(p_search)) || '%'
        or p.sku ilike '%' || private.escape_like(btrim(p_search)) || '%'
      )
  ),
  derived as (
    select base.*,
           (gross_sales - discounts - refunds)::bigint as net_sales,
           (gross_sales - discounts - refunds + shipping_charged)::bigint as net_revenue
    from base
  ),
  margins as (
    select derived.*,
           case when cogs is null then null
                else net_revenue - cogs - shipping_costs - transaction_fees - ad_spend end::bigint as contribution_margin
    from derived
  )
  select m.id, m.sku, m.name, m.unit_cost_e4, m.price_minor, m.archived, m.source, m.created_at,
         m.units, m.gross_sales, m.discounts, m.refunds, m.shipping_charged, m.cogs, m.lines_without_cost,
         m.shipping_costs, m.transaction_fees, m.ad_spend, m.net_sales, m.net_revenue, m.contribution_margin,
         case when m.contribution_margin is not null and m.net_revenue > 0
              then m.contribution_margin::double precision / m.net_revenue end
  from margins m
  where case coalesce(p_filter, 'active')
          when 'all' then true
          when 'archived' then m.archived
          when 'missing_cost' then not m.archived and m.unit_cost_e4 is null
          when 'loss' then m.contribution_margin < 0
          else not m.archived
        end;
$$;

-- -----------------------------------------------------------------------------
-- Daily units and product sales (after line discounts, before refunds) for one
-- product, for the product detail chart.
-- -----------------------------------------------------------------------------
create or replace function public.report_product_daily(p_store_id uuid, p_product_id uuid, p_from date, p_to date)
returns table (day date, units bigint, sales bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_report_request(p_store_id, p_from, p_to);
  return query
  with s as (
    select st.timezone from public.stores st where st.id = p_store_id
  ),
  l as (
    select (o.ordered_at at time zone s.timezone)::date as d,
           sum(i.quantity)::bigint as units,
           sum(i.gross_minor - i.discount_minor)::bigint as sales
    from public.order_items i
    join public.orders o on o.id = i.order_id
    cross join s
    where o.store_id = p_store_id
      and i.product_id = p_product_id
      and o.ordered_at >= (p_from::timestamp at time zone s.timezone)
      and o.ordered_at < ((p_to + 1)::timestamp at time zone s.timezone)
    group by 1
  )
  select g::date, coalesce(l.units, 0)::bigint, coalesce(l.sales, 0)::bigint
  from s
  cross join generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g
  left join l on l.d = g::date
  order by 1;
end;
$$;

-- -----------------------------------------------------------------------------
-- Orders of a period with resolved costs, for the transactions page.
-- -----------------------------------------------------------------------------
create or replace function public.report_order_list(p_store_id uuid, p_from date, p_to date, p_search text default null)
returns table (
  order_id uuid,
  external_id text,
  ordered_at timestamptz,
  day date,
  line_count integer,
  units bigint,
  gross bigint,
  discounts bigint,
  net bigint,
  shipping_charged bigint,
  taxes bigint,
  shipping_cost bigint,
  shipping_estimated boolean,
  fees bigint,
  fees_estimated boolean,
  cogs bigint,
  lines_without_cost integer,
  refunds bigint,
  source text,
  converted_from_tax_inclusive boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_report_request(p_store_id, p_from, p_to);
  return query
  select r.order_id, o.external_id, o.ordered_at, r.day,
         (select count(*)::integer from public.order_items i where i.order_id = r.order_id),
         r.units, r.gross, r.discounts, (r.gross - r.discounts)::bigint, r.shipping_charged, o.taxes_minor,
         r.shipping_cost, r.shipping_estimated, r.fees, r.fees_estimated, r.cogs, r.lines_without_cost,
         coalesce((select sum(rf.amount_minor) from public.refunds rf where rf.order_id = r.order_id), 0)::bigint,
         o.source, o.converted_from_tax_inclusive
  from private.report_orders(p_store_id, p_from, p_to) r
  join public.orders o on o.id = r.order_id
  where coalesce(btrim(p_search), '') = '' or o.external_id ilike '%' || private.escape_like(btrim(p_search)) || '%';
end;
$$;

revoke all on function public.report_product_catalog(uuid, date, date, text, text) from public, anon;
revoke all on function public.report_product_daily(uuid, uuid, date, date) from public, anon;
revoke all on function public.report_order_list(uuid, date, date, text) from public, anon;
grant execute on function public.report_product_catalog(uuid, date, date, text, text) to authenticated, service_role;
grant execute on function public.report_product_daily(uuid, uuid, date, date) to authenticated, service_role;
grant execute on function public.report_order_list(uuid, date, date, text) to authenticated, service_role;

-- Campaigns created by an import are removed when that import is undone.
alter table public.ad_campaigns
  add column import_job_id uuid references public.import_jobs (id) on delete set null;

-- Undo lookups: records created by an import.
create index refunds_import_idx on public.refunds (import_job_id) where import_job_id is not null;
create index expenses_import_idx on public.expenses (import_job_id) where import_job_id is not null;
create index ad_spend_import_idx on public.ad_spend_daily (import_job_id) where import_job_id is not null;
create index ad_campaigns_import_idx on public.ad_campaigns (import_job_id) where import_job_id is not null;
