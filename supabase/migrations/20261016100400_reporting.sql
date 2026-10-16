-- =============================================================================
-- Reporting functions.
--
-- These implement exactly the rules of src/lib/analytics/reference.ts, which
-- serves as the oracle in tests/db/reporting.test.ts. All functions are
-- SECURITY INVOKER: Row Level Security applies, so a caller only ever sees
-- stores of their own organisation. Date ranges are inclusive local dates in
-- the store's time zone and are limited to ten years.
-- =============================================================================

/*
 * Largest-remainder allocation: splits p_total across parts proportionally to
 * non-negative weights so the parts always sum exactly to p_total. Ties go to
 * the earlier index; all-zero weights split evenly. Mirrors
 * allocateProportionally() in src/lib/finance/money.ts.
 */
create or replace function private.allocate_proportionally(p_total bigint, p_weights bigint[])
returns bigint[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  n integer := coalesce(cardinality(p_weights), 0);
  w numeric[];
  total_weight numeric := 0;
  magnitude numeric := abs(p_total);
  direction integer := case when p_total < 0 then -1 else 1 end;
  base numeric[];
  rem numeric[];
  allocated numeric := 0;
  leftover integer;
  ordered integer[];
  i integer;
begin
  if n = 0 then
    if p_total <> 0 then
      raise exception 'Cannot allocate % across zero parts', p_total;
    end if;
    return array[]::bigint[];
  end if;

  w := array(select coalesce(x, 0)::numeric from unnest(p_weights) as x);
  for i in 1..n loop
    if w[i] < 0 then
      raise exception 'Weights must be non-negative';
    end if;
    total_weight := total_weight + w[i];
  end loop;
  if total_weight = 0 then
    w := array_fill(1::numeric, array[n]);
    total_weight := n;
  end if;

  base := array_fill(0::numeric, array[n]);
  rem := array_fill(0::numeric, array[n]);
  for i in 1..n loop
    base[i] := div(magnitude * w[i], total_weight);
    rem[i] := mod(magnitude * w[i], total_weight);
    allocated := allocated + base[i];
  end loop;

  leftover := (magnitude - allocated)::integer;
  if leftover > 0 then
    select array_agg(t.idx order by t.r desc, t.idx asc) into ordered
    from unnest(rem) with ordinality as t(r, idx);
    for i in 1..leftover loop
      base[ordered[i]] := base[ordered[i]] + 1;
    end loop;
  end if;

  return array(select (b * direction)::bigint from unnest(base) as b);
end;
$$;
grant execute on function private.allocate_proportionally(bigint, bigint[]) to authenticated, service_role;

-- Guard shared by the reporting functions: a valid, bounded date range, and
-- reporting access for the store's organisation (paused once a trial or
-- subscription has ended; the data itself stays readable for export). A store
-- the caller cannot see is filtered by Row Level Security and yields no rows.
create or replace function private.assert_report_request(p_store_id uuid, p_from date, p_to date)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  if p_to - p_from > 3700 then
    raise exception 'Date range too long' using errcode = '22023';
  end if;
  select s.organization_id into v_org from public.stores s where s.id = p_store_id;
  if v_org is not null and private.org_access(v_org) = 'expired' then
    raise exception 'Reports are paused because the trial or subscription has ended'
      using errcode = '42501', hint = 'subscription_required';
  end if;
end;
$$;
grant execute on function private.assert_report_request(uuid, date, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Per-order resolved values shared by the reports (recorded vs estimated).
-- -----------------------------------------------------------------------------
create or replace function private.report_orders(p_store_id uuid, p_from date, p_to date)
returns table (
  order_id uuid,
  day date,
  units bigint,
  gross bigint,
  discounts bigint,
  cogs bigint,
  sales_without_cost bigint,
  lines_without_cost integer,
  shipping_charged bigint,
  shipping_cost bigint,
  shipping_estimated boolean,
  fees bigint,
  fees_estimated boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select st.id, st.timezone, st.minor_digits, st.fee_rule_bps, st.fee_rule_fixed_minor, st.default_shipping_cost_minor,
           (st.fee_rule_bps is not null or st.fee_rule_fixed_minor is not null) as has_fee_rule
    from public.stores st
    where st.id = p_store_id
  ),
  o as (
    select o.id, (o.ordered_at at time zone s.timezone)::date as day, o.shipping_charged_minor, o.shipping_cost_minor,
           o.transaction_fees_minor, o.taxes_minor
    from public.orders o
    join s on s.id = o.store_id
    where o.ordered_at >= (p_from::timestamp at time zone s.timezone)
      and o.ordered_at < ((p_to + 1)::timestamp at time zone s.timezone)
  ),
  li as (
    select i.order_id,
           sum(i.quantity)::bigint as units,
           sum(i.gross_minor)::bigint as gross,
           sum(i.discount_minor)::bigint as discounts,
           sum(case when c.cost_e4 is null then 0
                    else round(c.cost_e4::numeric * i.quantity * power(10::numeric, s.minor_digits) / 10000) end)::bigint as cogs,
           sum(case when c.cost_e4 is null then i.gross_minor - i.discount_minor else 0 end)::bigint as sales_without_cost,
           (count(*) filter (where c.cost_e4 is null))::integer as lines_without_cost
    from public.order_items i
    join o on o.id = i.order_id
    cross join s
    left join public.products p on p.id = i.product_id
    cross join lateral (select coalesce(i.unit_cost_e4, p.unit_cost_e4) as cost_e4) c
    group by i.order_id
  )
  select
    o.id,
    o.day,
    coalesce(li.units, 0),
    coalesce(li.gross, 0),
    coalesce(li.discounts, 0),
    coalesce(li.cogs, 0),
    coalesce(li.sales_without_cost, 0),
    coalesce(li.lines_without_cost, 0),
    o.shipping_charged_minor,
    coalesce(o.shipping_cost_minor, s.default_shipping_cost_minor),
    (o.shipping_cost_minor is null and s.default_shipping_cost_minor is not null),
    case
      when o.transaction_fees_minor is not null then o.transaction_fees_minor
      when s.has_fee_rule then
        round(greatest(coalesce(li.gross, 0) - coalesce(li.discounts, 0) + o.shipping_charged_minor + o.taxes_minor, 0)::numeric
              * coalesce(s.fee_rule_bps, 0) / 10000)::bigint + coalesce(s.fee_rule_fixed_minor, 0)
      else null
    end,
    (o.transaction_fees_minor is null and s.has_fee_rule)
  from o
  cross join s
  left join li on li.order_id = o.id;
$$;
grant execute on function private.report_orders(uuid, date, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Daily totals (PeriodTotals per local day).
-- -----------------------------------------------------------------------------
create or replace function public.report_daily_totals(p_store_id uuid, p_from date, p_to date)
returns table (
  day date,
  orders integer,
  units bigint,
  gross_sales bigint,
  discounts bigint,
  refunds bigint,
  shipping_charged bigint,
  cogs bigint,
  product_sales_after_discounts bigint,
  sales_without_cost bigint,
  lines_without_cost integer,
  shipping_costs bigint,
  shipping_costs_estimated bigint,
  orders_without_shipping_cost integer,
  transaction_fees bigint,
  transaction_fees_estimated bigint,
  orders_without_fees integer,
  ad_spend bigint,
  other_variable_costs bigint,
  fixed_costs bigint
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
  days as (
    select g::date as day from s, generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g
  ),
  od as (
    select r.day,
           count(*)::integer as orders,
           sum(r.units)::bigint as units,
           sum(r.gross)::bigint as gross,
           sum(r.discounts)::bigint as discounts,
           sum(r.shipping_charged)::bigint as shipping_charged,
           sum(r.cogs)::bigint as cogs,
           sum(r.gross - r.discounts)::bigint as psad,
           sum(r.sales_without_cost)::bigint as swc,
           sum(r.lines_without_cost)::integer as lwc,
           coalesce(sum(r.shipping_cost), 0)::bigint as ship,
           coalesce(sum(r.shipping_cost) filter (where r.shipping_estimated), 0)::bigint as ship_est,
           (count(*) filter (where r.shipping_cost is null))::integer as no_ship,
           coalesce(sum(r.fees), 0)::bigint as fees,
           coalesce(sum(r.fees) filter (where r.fees_estimated), 0)::bigint as fees_est,
           (count(*) filter (where r.fees is null))::integer as no_fees
    from private.report_orders(p_store_id, p_from, p_to) r
    group by r.day
  ),
  rd as (
    select (rf.refunded_at at time zone s.timezone)::date as day, sum(rf.amount_minor)::bigint as amount
    from public.refunds rf
    join s on s.id = rf.store_id
    where rf.refunded_at >= (p_from::timestamp at time zone s.timezone)
      and rf.refunded_at < ((p_to + 1)::timestamp at time zone s.timezone)
    group by 1
  ),
  ad as (
    select a.spend_date as day, sum(a.spend_minor)::bigint as amount
    from public.ad_spend_daily a
    where a.store_id = p_store_id and a.spend_date between p_from and p_to
    group by 1
  ),
  ed as (
    select e.incurred_on as day,
           coalesce(sum(e.amount_minor) filter (where e.kind = 'fixed'), 0)::bigint as fixed,
           coalesce(sum(e.amount_minor) filter (where e.kind = 'variable' and e.category in ('shipping', 'fulfilment')), 0)::bigint as ship,
           coalesce(sum(e.amount_minor) filter (where e.kind = 'variable' and e.category = 'payment_fees'), 0)::bigint as fees,
           coalesce(sum(e.amount_minor) filter (where e.kind = 'variable' and e.category not in ('shipping', 'fulfilment', 'payment_fees')), 0)::bigint as other
    from public.expenses e
    where e.store_id = p_store_id and e.incurred_on between p_from and p_to
    group by 1
  )
  select d.day,
         coalesce(od.orders, 0),
         coalesce(od.units, 0)::bigint,
         coalesce(od.gross, 0)::bigint,
         coalesce(od.discounts, 0)::bigint,
         coalesce(rd.amount, 0)::bigint,
         coalesce(od.shipping_charged, 0)::bigint,
         coalesce(od.cogs, 0)::bigint,
         coalesce(od.psad, 0)::bigint,
         coalesce(od.swc, 0)::bigint,
         coalesce(od.lwc, 0),
         (coalesce(od.ship, 0) + coalesce(ed.ship, 0))::bigint,
         coalesce(od.ship_est, 0)::bigint,
         coalesce(od.no_ship, 0),
         (coalesce(od.fees, 0) + coalesce(ed.fees, 0))::bigint,
         coalesce(od.fees_est, 0)::bigint,
         coalesce(od.no_fees, 0),
         coalesce(ad.amount, 0)::bigint,
         coalesce(ed.other, 0)::bigint,
         coalesce(ed.fixed, 0)::bigint
  from days d
  left join od on od.day = d.day
  left join rd on rd.day = d.day
  left join ad on ad.day = d.day
  left join ed on ed.day = d.day
  order by d.day;
end;
$$;

-- -----------------------------------------------------------------------------
-- Product breakdown with allocation of order-level amounts.
-- -----------------------------------------------------------------------------
create or replace function public.report_product_breakdown(p_store_id uuid, p_from date, p_to date)
returns table (
  product_id uuid,
  sku text,
  name text,
  unit_cost_e4 bigint,
  archived boolean,
  units bigint,
  gross_sales bigint,
  discounts bigint,
  refunds bigint,
  shipping_charged bigint,
  cogs bigint,
  lines_without_cost integer,
  shipping_costs bigint,
  transaction_fees bigint,
  ad_spend bigint
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
    select st.id, st.timezone, st.minor_digits from public.stores st where st.id = p_store_id
  ),
  o as (
    select * from private.report_orders(p_store_id, p_from, p_to)
  ),
  lines as (
    select i.id, i.order_id, i.position, i.product_id, i.quantity, i.gross_minor, i.discount_minor,
           greatest(i.gross_minor - i.discount_minor, 0)::bigint as w,
           coalesce(i.unit_cost_e4, p.unit_cost_e4) as cost_e4
    from public.order_items i
    join o on o.order_id = i.order_id
    left join public.products p on p.id = i.product_id
  ),
  order_alloc as (
    select o.order_id,
           array_agg(l.id order by l.position) as item_ids,
           private.allocate_proportionally(o.shipping_charged, array_agg(l.w order by l.position)) as ship_charged,
           case when o.shipping_cost is null then null
                else private.allocate_proportionally(o.shipping_cost, array_agg(l.w order by l.position)) end as ship_cost,
           case when o.fees is null then null
                else private.allocate_proportionally(o.fees, array_agg(l.w order by l.position)) end as fees
    from o
    join lines l on l.order_id = o.order_id
    group by o.order_id, o.shipping_charged, o.shipping_cost, o.fees
  ),
  line_alloc as (
    select u.item_id, u.ship_charged, u.ship_cost, u.fees
    from order_alloc a
    cross join lateral unnest(a.item_ids, a.ship_charged, a.ship_cost, a.fees) as u(item_id, ship_charged, ship_cost, fees)
  ),
  product_sales as (
    select l.product_id,
           sum(l.quantity)::bigint as units,
           sum(l.gross_minor)::bigint as gross,
           sum(l.discount_minor)::bigint as discounts,
           coalesce(sum(la.ship_charged), 0)::bigint as ship_charged,
           sum(case when l.cost_e4 is null then 0
                    else round(l.cost_e4::numeric * l.quantity * power(10::numeric, s.minor_digits) / 10000) end)::bigint as cogs_known,
           (count(*) filter (where l.cost_e4 is null))::integer as lwc,
           coalesce(sum(la.ship_cost), 0)::bigint as ship_cost,
           coalesce(sum(la.fees), 0)::bigint as fees
    from lines l
    join line_alloc la on la.item_id = l.id
    cross join s
    where l.product_id is not null
    group by l.product_id
  ),
  refunds_in as (
    select rf.id, rf.order_id, rf.amount_minor
    from public.refunds rf
    join s on s.id = rf.store_id
    where rf.refunded_at >= (p_from::timestamp at time zone s.timezone)
      and rf.refunded_at < ((p_to + 1)::timestamp at time zone s.timezone)
      and rf.order_id is not null
  ),
  refund_alloc as (
    select r.id,
           array_agg(i.id order by i.position) as item_ids,
           private.allocate_proportionally(r.amount_minor, array_agg(greatest(i.gross_minor - i.discount_minor, 0)::bigint order by i.position)) as shares
    from refunds_in r
    join public.order_items i on i.order_id = r.order_id
    group by r.id, r.amount_minor
  ),
  product_refunds as (
    select i.product_id, sum(u.share)::bigint as refunds
    from refund_alloc a
    cross join lateral unnest(a.item_ids, a.shares) as u(item_id, share)
    join public.order_items i on i.id = u.item_id
    where i.product_id is not null
    group by i.product_id
  ),
  product_ads as (
    select c.product_id, sum(a.spend_minor)::bigint as spend
    from public.ad_spend_daily a
    join public.ad_campaigns c on c.id = a.campaign_id
    where a.store_id = p_store_id and c.product_id is not null and a.spend_date between p_from and p_to
    group by c.product_id
  ),
  ids as (
    select ps.product_id from product_sales ps
    union select pr.product_id from product_refunds pr
    union select pa.product_id from product_ads pa
  )
  select p.id, p.sku, p.name, p.unit_cost_e4, p.archived_at is not null,
         coalesce(ps.units, 0)::bigint,
         coalesce(ps.gross, 0)::bigint,
         coalesce(ps.discounts, 0)::bigint,
         coalesce(pr.refunds, 0)::bigint,
         coalesce(ps.ship_charged, 0)::bigint,
         case when coalesce(ps.lwc, 0) > 0 then null else coalesce(ps.cogs_known, 0) end::bigint,
         coalesce(ps.lwc, 0),
         coalesce(ps.ship_cost, 0)::bigint,
         coalesce(ps.fees, 0)::bigint,
         coalesce(pa.spend, 0)::bigint
  from ids
  join public.products p on p.id = ids.product_id
  left join product_sales ps on ps.product_id = ids.product_id
  left join product_refunds pr on pr.product_id = ids.product_id
  left join product_ads pa on pa.product_id = ids.product_id;
end;
$$;

-- Amounts that stay at store level because no valid product allocation exists.
create or replace function public.report_unallocated(p_store_id uuid, p_from date, p_to date)
returns table (ad_spend bigint, refunds bigint, variable_expenses bigint)
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
  refunds_in as (
    select rf.id, rf.order_id, rf.amount_minor
    from public.refunds rf
    join s on s.id = rf.store_id
    where rf.refunded_at >= (p_from::timestamp at time zone s.timezone)
      and rf.refunded_at < ((p_to + 1)::timestamp at time zone s.timezone)
  ),
  refund_alloc as (
    select r.id,
           array_agg(i.product_id order by i.position) as product_ids,
           private.allocate_proportionally(r.amount_minor, array_agg(greatest(i.gross_minor - i.discount_minor, 0)::bigint order by i.position)) as shares
    from refunds_in r
    join public.order_items i on i.order_id = r.order_id
    group by r.id, r.amount_minor
  ),
  unattributed_refunds as (
    select coalesce(sum(u.share), 0) as amount
    from refund_alloc a
    cross join lateral unnest(a.product_ids, a.shares) as u(product_id, share)
    where u.product_id is null
  ),
  orphan_refunds as (
    select coalesce(sum(r.amount_minor), 0) as amount
    from refunds_in r
    where r.order_id is null or not exists (select 1 from public.order_items i where i.order_id = r.order_id)
  ),
  ads as (
    select coalesce(sum(a.spend_minor) filter (where c.product_id is null), 0) as amount
    from public.ad_spend_daily a
    join public.ad_campaigns c on c.id = a.campaign_id
    where a.store_id = p_store_id and a.spend_date between p_from and p_to
  ),
  expenses as (
    select coalesce(sum(e.amount_minor), 0) as amount
    from public.expenses e
    where e.store_id = p_store_id and e.kind = 'variable' and e.incurred_on between p_from and p_to
  )
  select ads.amount::bigint, (unattributed_refunds.amount + orphan_refunds.amount)::bigint, expenses.amount::bigint
  from ads, unattributed_refunds, orphan_refunds, expenses;
end;
$$;

-- Campaign performance (platform-reported conversion values).
create or replace function public.report_campaign_breakdown(p_store_id uuid, p_from date, p_to date)
returns table (
  campaign_id uuid,
  platform text,
  name text,
  product_id uuid,
  spend bigint,
  impressions bigint,
  clicks bigint,
  conversions numeric,
  conversion_value bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_report_request(p_store_id, p_from, p_to);
  return query
  select c.id, c.platform, c.name, c.product_id,
         sum(a.spend_minor)::bigint,
         sum(a.impressions)::bigint,
         sum(a.clicks)::bigint,
         sum(a.conversions)::numeric,
         sum(a.conversion_value_minor)::bigint
  from public.ad_campaigns c
  join public.ad_spend_daily a on a.campaign_id = c.id
  where c.store_id = p_store_id and a.spend_date between p_from and p_to
  group by c.id, c.platform, c.name, c.product_id
  having sum(a.spend_minor) > 0 or sum(a.conversion_value_minor) > 0
  order by sum(a.spend_minor) desc, c.name;
end;
$$;

-- Daily advertising by platform, for trend charts.
create or replace function public.report_ad_daily(p_store_id uuid, p_from date, p_to date)
returns table (day date, platform text, spend bigint, conversion_value bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform private.assert_report_request(p_store_id, p_from, p_to);
  return query
  select a.spend_date, c.platform, sum(a.spend_minor)::bigint, sum(a.conversion_value_minor)::bigint
  from public.ad_spend_daily a
  join public.ad_campaigns c on c.id = a.campaign_id
  where a.store_id = p_store_id and a.spend_date between p_from and p_to
  group by a.spend_date, c.platform
  order by a.spend_date, c.platform;
end;
$$;

revoke all on function public.report_daily_totals(uuid, date, date) from public, anon;
revoke all on function public.report_product_breakdown(uuid, date, date) from public, anon;
revoke all on function public.report_unallocated(uuid, date, date) from public, anon;
revoke all on function public.report_campaign_breakdown(uuid, date, date) from public, anon;
revoke all on function public.report_ad_daily(uuid, date, date) from public, anon;
grant execute on function public.report_daily_totals(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_product_breakdown(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_unallocated(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_campaign_breakdown(uuid, date, date) to authenticated, service_role;
grant execute on function public.report_ad_daily(uuid, date, date) to authenticated, service_role;
