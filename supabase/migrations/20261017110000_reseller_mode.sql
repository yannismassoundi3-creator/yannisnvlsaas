-- =============================================================================
-- Reseller mode ("Mode revendeur").
--
-- People who resell second-hand pieces on Vinted, Leboncoin, eBay or Vestiaire
-- Collective record each item they buy and each sale in a few seconds. Their
-- data reuses the existing tables, so every metric, report, export and Row
-- Level Security policy keeps working unchanged:
--   item  = a products row (name, unit_cost_e4 = purchase price, acquired_on)
--   sale  = an orders row + one order_items row (quantity 1, cost snapshot),
--           with orders.sales_channel recording where it was sold
--   stock = items without any order line; an item with one is sold.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columns
-- -----------------------------------------------------------------------------
alter table public.stores
  add column business_model text not null default 'ecommerce'
    check (business_model in ('ecommerce', 'reseller'));
comment on column public.stores.business_model is
  'ecommerce: imports orders, costs and ads. reseller: records items bought and sold one by one.';

-- stores uses column-level grants (see the foundation migration).
grant insert (business_model), update (business_model) on public.stores to authenticated;

alter table public.products
  add column acquired_on date
    check (acquired_on is null or acquired_on between date '2000-01-01' and date '2100-12-31');
comment on column public.products.acquired_on is 'Purchase date of a resold item (optional).';

-- Mirrors PLATFORMS in src/lib/onboarding/constants.ts, like the platform check on stores.
alter table public.orders
  add column sales_channel text
    check (sales_channel is null or sales_channel in (
      'shopify', 'woocommerce', 'prestashop', 'wix', 'squarespace', 'etsy', 'amazon',
      'vinted', 'leboncoin', 'ebay', 'vestiaire_collective',
      'other'
    ));
comment on column public.orders.sales_channel is 'Where the sale happened (reseller quick sales). Null when unknown.';

-- products and orders have table-level grants: the new columns inherit them and
-- their RLS policies (members read, writes need an active trial or subscription).

-- Stock lookups: "which items have no order line" and recent items first.
create index products_store_created_idx on public.products (store_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Onboarding RPC: optional business model. Reseller stores start with a zero
-- fee rule and a zero default shipping cost, because Vinted and Leboncoin
-- charge the buyer, not the seller (sellers can still record fees per sale).
-- The old seven-argument signature keeps working through the default.
-- -----------------------------------------------------------------------------
drop function public.create_organization_with_store(text, text, text, text, smallint, text, boolean);

create function public.create_organization_with_store(
  p_organization_name text,
  p_store_name text,
  p_platform text,
  p_currency text,
  p_minor_digits smallint,
  p_timezone text,
  p_prices_include_tax boolean,
  p_business_model text default 'ecommerce'
)
returns table (organization_id uuid, store_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_store uuid;
  v_model text := coalesce(p_business_model, 'ecommerce');
  v_reseller boolean;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_model not in ('ecommerce', 'reseller') then
    raise exception 'Unknown business model' using errcode = '22023';
  end if;
  if exists (select 1 from public.organization_members m where m.user_id = v_user) then
    raise exception 'You already belong to an organisation' using errcode = '23505';
  end if;
  v_reseller := v_model = 'reseller';

  insert into public.organizations (name, created_by)
  values (btrim(p_organization_name), v_user)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_user, 'owner');

  insert into public.stores (organization_id, name, platform, currency, minor_digits, timezone, prices_include_tax,
                             business_model, fee_rule_bps, fee_rule_fixed_minor, default_shipping_cost_minor)
  values (v_org, btrim(p_store_name), p_platform, p_currency, p_minor_digits, p_timezone, coalesce(p_prices_include_tax, false),
          v_model,
          case when v_reseller then 0 end,
          case when v_reseller then 0 end,
          case when v_reseller then 0 end)
  returning id into v_store;

  return query select v_org, v_store;
end;
$$;

revoke all on function public.create_organization_with_store(text, text, text, text, smallint, text, boolean, text) from public, anon;
grant execute on function public.create_organization_with_store(text, text, text, text, smallint, text, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Items of a reseller store with their status and, once sold, the sale.
--
-- An item is sold when an order line points to it; its latest line is shown.
-- Sale figures come from private.report_orders, so recorded and estimated
-- shipping costs and fees follow exactly the rules of every other report.
-- The margin is shown only for single-line orders (a quick sale): splitting a
-- multi-line order's costs over items would need the products report's
-- allocation, which the Products page already provides. It is null when the
-- purchase price is unknown, never assumed to be zero.
--   p_status: 'in_stock', 'sold' or 'all' (default)
-- -----------------------------------------------------------------------------
create or replace function public.reseller_items(p_store_id uuid, p_status text default 'all', p_search text default null)
returns table (
  product_id uuid,
  name text,
  unit_cost_e4 bigint,
  acquired_on date,
  created_at timestamptz,
  stocked_on date,
  archived boolean,
  status text,
  order_id uuid,
  order_external_id text,
  ordered_at timestamptz,
  sold_on date,
  sales_channel text,
  sale_price bigint,
  shipping_charged bigint,
  refunds bigint,
  item_cost bigint,
  shipping_cost bigint,
  fees bigint,
  margin bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_report_request(p_store_id, current_date, current_date);
  return query
  with s as (
    select st.id, st.timezone, st.minor_digits from public.stores st where st.id = p_store_id
  ),
  items as (
    select p.*, (p.created_at at time zone s.timezone)::date as created_local
    from public.products p
    join s on s.id = p.store_id
    where coalesce(btrim(p_search), '') = ''
       or p.name ilike '%' || private.escape_like(btrim(p_search)) || '%'
  ),
  last_line as (
    select distinct on (i.product_id)
           i.product_id, i.order_id, i.gross_minor, i.discount_minor, i.quantity,
           coalesce(i.unit_cost_e4, it.unit_cost_e4) as cost_e4,
           o.external_id, o.ordered_at, o.sales_channel
    from public.order_items i
    join items it on it.id = i.product_id
    join public.orders o on o.id = i.order_id
    order by i.product_id, o.ordered_at desc, i.id
  ),
  sold_orders as (
    select r.*
    from private.report_orders(p_store_id, date '2000-01-01', date '2100-12-30') r
    where r.order_id in (select l.order_id from last_line l)
  ),
  line_counts as (
    select i.order_id, count(*)::integer as lines
    from public.order_items i
    where i.order_id in (select l.order_id from last_line l)
    group by i.order_id
  ),
  order_refunds as (
    select rf.order_id, sum(rf.amount_minor)::bigint as amount
    from public.refunds rf
    where rf.order_id in (select l.order_id from last_line l)
    group by rf.order_id
  ),
  merged as (
    select it.id, it.name, it.unit_cost_e4, it.acquired_on, it.created_at,
           coalesce(it.acquired_on, it.created_local) as stocked_on,
           it.archived_at is not null as archived,
           case when l.order_id is null then 'in_stock' else 'sold' end as status,
           l.order_id, l.external_id, l.ordered_at,
           (l.ordered_at at time zone s.timezone)::date as sold_on,
           l.sales_channel,
           (l.gross_minor - l.discount_minor)::bigint as sale_price,
           case when lc.lines = 1 then so.shipping_charged end as shipping_charged,
           case when lc.lines = 1 then coalesce(rf.amount, 0) end as refunds,
           case when l.cost_e4 is null then null
                else round(l.cost_e4::numeric * l.quantity * power(10::numeric, s.minor_digits) / 10000)::bigint end as item_cost,
           case when lc.lines = 1 then so.shipping_cost end as shipping_cost,
           case when lc.lines = 1 then so.fees end as fees,
           lc.lines
    from items it
    cross join s
    left join last_line l on l.product_id = it.id
    left join sold_orders so on so.order_id = l.order_id
    left join line_counts lc on lc.order_id = l.order_id
    left join order_refunds rf on rf.order_id = l.order_id
  )
  select r.id, r.name, r.unit_cost_e4, r.acquired_on, r.created_at, r.stocked_on, r.archived, r.status,
         r.order_id, r.external_id, r.ordered_at, r.sold_on, r.sales_channel,
         r.sale_price, r.shipping_charged, r.refunds, r.item_cost, r.shipping_cost, r.fees,
         case when r.status = 'sold' and r.lines = 1 and r.item_cost is not null
              then (r.sale_price + r.shipping_charged - r.refunds - r.item_cost
                    - coalesce(r.shipping_cost, 0) - coalesce(r.fees, 0))::bigint end
  from merged r
  where case coalesce(p_status, 'all')
          when 'in_stock' then r.status = 'in_stock' and not r.archived
          when 'sold' then r.status = 'sold'
          else true
        end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Stock summary: items in stock (not archived, never sold), their total
-- purchase cost ("money tied up"), how many have no purchase price, and how
-- many have been in stock since before p_stale_before.
-- -----------------------------------------------------------------------------
create or replace function public.reseller_stock_summary(p_store_id uuid, p_stale_before date)
returns table (items integer, cost_minor bigint, items_without_cost integer, stale_items integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_report_request(p_store_id, current_date, current_date);
  return query
  with s as (
    select st.id, st.timezone, st.minor_digits from public.stores st where st.id = p_store_id
  ),
  stock as (
    select p.unit_cost_e4, coalesce(p.acquired_on, (p.created_at at time zone s.timezone)::date) as stocked_on, s.minor_digits
    from public.products p
    join s on s.id = p.store_id
    where p.archived_at is null
      and not exists (select 1 from public.order_items i where i.product_id = p.id)
  )
  select count(*)::integer,
         coalesce(sum(round(st.unit_cost_e4::numeric * power(10::numeric, st.minor_digits) / 10000)), 0)::bigint,
         (count(*) filter (where st.unit_cost_e4 is null))::integer,
         (count(*) filter (where st.stocked_on < p_stale_before))::integer
  from stock st;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sales and margin per selling platform for a period. Same per-order rules as
-- report_daily_totals; refunds count on their own date, under the platform of
-- their order. Store-wide expenses and ad spend stay at store level: they are
-- never spread over platforms.
-- -----------------------------------------------------------------------------
create or replace function public.report_channel_breakdown(p_store_id uuid, p_from date, p_to date)
returns table (
  sales_channel text,
  orders integer,
  units bigint,
  net_revenue bigint,
  cogs bigint,
  lines_without_cost integer,
  shipping_costs bigint,
  transaction_fees bigint,
  margin bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_report_request(p_store_id, p_from, p_to);
  return query
  with s as (
    select st.id, st.timezone from public.stores st where st.id = p_store_id
  ),
  o as (
    select ord.sales_channel as channel, r.*
    from private.report_orders(p_store_id, p_from, p_to) r
    join public.orders ord on ord.id = r.order_id
  ),
  sales as (
    select o.channel,
           count(*)::integer as orders,
           sum(o.units)::bigint as units,
           sum(o.gross - o.discounts + o.shipping_charged)::bigint as revenue,
           sum(o.cogs)::bigint as cogs,
           sum(o.lines_without_cost)::integer as lwc,
           coalesce(sum(o.shipping_cost), 0)::bigint as ship,
           coalesce(sum(o.fees), 0)::bigint as fees
    from o
    group by o.channel
  ),
  refunds as (
    select ord.sales_channel as channel, sum(rf.amount_minor)::bigint as amount
    from public.refunds rf
    join s on s.id = rf.store_id
    join public.orders ord on ord.id = rf.order_id
    where rf.refunded_at >= (p_from::timestamp at time zone s.timezone)
      and rf.refunded_at < ((p_to + 1)::timestamp at time zone s.timezone)
    group by ord.sales_channel
  ),
  channels as (
    select sa.channel from sales sa
    union
    select r.channel from refunds r
  )
  select c.channel,
         coalesce(sa.orders, 0),
         coalesce(sa.units, 0)::bigint,
         (coalesce(sa.revenue, 0) - coalesce(r.amount, 0))::bigint,
         coalesce(sa.cogs, 0)::bigint,
         coalesce(sa.lwc, 0),
         coalesce(sa.ship, 0)::bigint,
         coalesce(sa.fees, 0)::bigint,
         case when coalesce(sa.lwc, 0) > 0 then null
              else (coalesce(sa.revenue, 0) - coalesce(r.amount, 0) - coalesce(sa.cogs, 0) - coalesce(sa.ship, 0) - coalesce(sa.fees, 0)) end::bigint
  from channels c
  left join sales sa on sa.channel is not distinct from c.channel
  left join refunds r on r.channel is not distinct from c.channel
  order by coalesce(sa.revenue, 0) - coalesce(r.amount, 0) desc, c.channel nulls last;
end;
$$;

revoke all on function public.reseller_items(uuid, text, text) from public, anon;
revoke all on function public.reseller_stock_summary(uuid, date) from public, anon;
revoke all on function public.report_channel_breakdown(uuid, date, date) from public, anon;
grant execute on function public.reseller_items(uuid, text, text) to authenticated, service_role;
grant execute on function public.reseller_stock_summary(uuid, date) to authenticated, service_role;
grant execute on function public.report_channel_breakdown(uuid, date, date) to authenticated, service_role;
