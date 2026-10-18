-- =============================================================================
-- Reseller mode: several identical pieces per item ("3 Ralph Lauren polos",
-- "a lot of 10 t-shirts for €20").
--
--   products.stock_quantity = number of pieces bought (null = 1, so every
--                             existing item keeps meaning one piece)
--   sold units              = sum of order_items.quantity of the item
--   remaining               = stock_quantity − sold units (never below 0)
--
-- An item is "in stock" while at least one piece remains and "sold" once none
-- remains. A partially sold item is listed once, with "2 left out of 3" and its
-- latest sale (the same sale fields as before), in the "in stock" tab and in
-- the "sold" tab (items with at least one sale).
--
-- Sales go through public.reseller_record_sale, which locks the item row,
-- checks the remaining pieces and writes the order and its line in one
-- transaction, so two quick sales of the last piece cannot both succeed.
-- Lowering the quantity of an item below the pieces already sold is refused.
--
-- Nothing here needs a superuser: plain DDL on public objects, SECURITY
-- INVOKER functions (RLS applies as for any query of the user) and grants.
-- =============================================================================

alter table public.products
  add column stock_quantity integer
    check (stock_quantity is null or stock_quantity between 1 and 100000);
comment on column public.products.stock_quantity is
  'Reseller mode: number of identical pieces bought for this item. Null means one piece.';

-- products has table-level grants: the new column inherits them and its RLS
-- policies (members read, writes need an active trial or subscription).

-- -----------------------------------------------------------------------------
-- The quantity of an item can never go below the pieces already sold. Fires
-- only when stock_quantity actually changes, so imported catalogues (always
-- null) and edits that keep the quantity are never affected. The row being
-- updated is locked, like in reseller_record_sale, so both serialise.
-- -----------------------------------------------------------------------------
create or replace function private.check_stock_quantity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sold bigint;
begin
  select coalesce(sum(i.quantity), 0) into v_sold
  from public.order_items i
  where i.product_id = new.id;
  if coalesce(new.stock_quantity, 1) < v_sold then
    raise exception 'stock_quantity_below_sold'
      using errcode = '23514', detail = v_sold::text;
  end if;
  return new;
end;
$$;

create trigger products_stock_quantity_guard
  before update of stock_quantity on public.products
  for each row
  when (new.stock_quantity is distinct from old.stock_quantity)
  execute function private.check_stock_quantity();

-- -----------------------------------------------------------------------------
-- Items of a reseller store with their quantities, status and latest sale.
-- The return type gains four columns, so the function is dropped and created
-- again (same arguments, same grants as in the reseller mode migration).
--
--   quantity      pieces bought (stock_quantity, 1 when null)
--   sold_units    pieces sold (sum of the item's order line quantities)
--   remaining     pieces left, never below 0
--   sale_quantity pieces in the latest sale (null before the first sale)
--   status        'in_stock' while remaining > 0, else 'sold'
--   p_status      'in_stock' (remaining > 0, not archived), 'sold' (at least
--                 one sale) or 'all' (default)
--
-- The sale columns describe the latest sale, as before: sale_price is what
-- that sale brought for all its pieces, item_cost its cost snapshot × its
-- quantity. The margin is shown only for single-line orders (a quick sale)
-- and is null when the purchase price is unknown, never assumed to be zero.
-- -----------------------------------------------------------------------------
drop function public.reseller_items(uuid, text, text);

create function public.reseller_items(p_store_id uuid, p_status text default 'all', p_search text default null)
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
  margin bigint,
  quantity integer,
  sold_units bigint,
  remaining bigint,
  sale_quantity integer
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
  units as (
    select i.product_id, sum(i.quantity)::bigint as sold
    from public.order_items i
    join items it on it.id = i.product_id
    group by i.product_id
  ),
  last_line as (
    select distinct on (i.product_id)
           i.product_id, i.order_id, i.gross_minor, i.discount_minor, i.quantity,
           coalesce(i.unit_cost_e4, it.unit_cost_e4) as cost_e4,
           o.external_id, o.ordered_at, o.sales_channel
    from public.order_items i
    join items it on it.id = i.product_id
    join public.orders o on o.id = i.order_id
    -- Sales of the same day share their time (noon): the one recorded last wins.
    order by i.product_id, o.ordered_at desc, o.created_at desc, i.id
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
           coalesce(it.stock_quantity, 1) as qty,
           coalesce(u.sold, 0)::bigint as sold_units,
           greatest(coalesce(it.stock_quantity, 1) - coalesce(u.sold, 0), 0)::bigint as remaining,
           l.order_id, l.external_id, l.ordered_at,
           (l.ordered_at at time zone s.timezone)::date as sold_on,
           l.sales_channel,
           l.quantity as sale_quantity,
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
    left join units u on u.product_id = it.id
    left join last_line l on l.product_id = it.id
    left join sold_orders so on so.order_id = l.order_id
    left join line_counts lc on lc.order_id = l.order_id
    left join order_refunds rf on rf.order_id = l.order_id
  )
  select r.id, r.name, r.unit_cost_e4, r.acquired_on, r.created_at, r.stocked_on, r.archived,
         case when r.remaining > 0 then 'in_stock' else 'sold' end,
         r.order_id, r.external_id, r.ordered_at, r.sold_on, r.sales_channel,
         r.sale_price, r.shipping_charged, r.refunds, r.item_cost, r.shipping_cost, r.fees,
         case when r.order_id is not null and r.lines = 1 and r.item_cost is not null
              then (r.sale_price + r.shipping_charged - r.refunds - r.item_cost
                    - coalesce(r.shipping_cost, 0) - coalesce(r.fees, 0))::bigint end,
         r.qty, r.sold_units, r.remaining, r.sale_quantity
  from merged r
  where case coalesce(p_status, 'all')
          when 'in_stock' then r.remaining > 0 and not r.archived
          when 'sold' then r.sold_units > 0
          else true
        end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Stock summary, in pieces: pieces in stock (items not archived), their total
-- purchase cost ("money tied up": remaining × unit cost, rounded per item like
-- every line cost), pieces without a purchase price, and pieces in stock since
-- before p_stale_before. Same signature and return type as before.
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
    select p.unit_cost_e4,
           coalesce(p.acquired_on, (p.created_at at time zone s.timezone)::date) as stocked_on,
           s.minor_digits,
           greatest(coalesce(p.stock_quantity, 1) - coalesce(
             (select sum(i.quantity) from public.order_items i where i.product_id = p.id), 0), 0)::bigint as remaining
    from public.products p
    join s on s.id = p.store_id
    where p.archived_at is null
  )
  select coalesce(sum(st.remaining), 0)::integer,
         coalesce(sum(round(st.unit_cost_e4::numeric * st.remaining * power(10::numeric, st.minor_digits) / 10000)), 0)::bigint,
         coalesce(sum(st.remaining) filter (where st.unit_cost_e4 is null), 0)::integer,
         coalesce(sum(st.remaining) filter (where st.stocked_on < p_stale_before), 0)::integer
  from stock st
  where st.remaining > 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- Records a quick sale of `p_quantity` pieces of a stock item: an order (sale
-- number, date, platform, optional shipping cost and fee) with one line
-- (that quantity, p_gross_minor for all the pieces, the item's purchase price
-- as unit cost snapshot). Returns the new order id.
--
-- The item row is locked first (SELECT … FOR UPDATE), so concurrent sales of
-- the same item run one after the other and each sees the pieces the others
-- sold: a sale asking for more pieces than remain fails with message
-- 'insufficient_stock' (detail: the remaining pieces) and writes nothing.
-- Unknown items (or items of another organisation, hidden by RLS) fail with
-- 'item_not_found'. A duplicate sale number fails with 23505 so the caller
-- can retry with a new one. Writes follow RLS like any insert of the user.
-- -----------------------------------------------------------------------------
create function public.reseller_record_sale(
  p_store_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_external_id text,
  p_ordered_at timestamptz,
  p_gross_minor bigint,
  p_shipping_cost_minor bigint default null,
  p_fees_minor bigint default null,
  p_sales_channel text default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_product record;
  v_sold bigint;
  v_remaining bigint;
  v_order uuid;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 100000 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  select p.id, p.organization_id, p.name, p.unit_cost_e4, p.stock_quantity
    into v_product
  from public.products p
  where p.id = p_product_id and p.store_id = p_store_id
  for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  select coalesce(sum(i.quantity), 0) into v_sold
  from public.order_items i
  where i.product_id = v_product.id;
  v_remaining := greatest(coalesce(v_product.stock_quantity, 1) - v_sold, 0);
  if p_quantity > v_remaining then
    raise exception 'insufficient_stock' using errcode = 'P0001', detail = v_remaining::text;
  end if;

  insert into public.orders (organization_id, store_id, external_id, ordered_at, shipping_charged_minor, taxes_minor,
                             shipping_cost_minor, transaction_fees_minor, converted_from_tax_inclusive, sales_channel, source)
  values (v_product.organization_id, p_store_id, p_external_id, p_ordered_at, 0, 0,
          p_shipping_cost_minor, p_fees_minor, false, p_sales_channel, 'manual')
  returning id into v_order;

  insert into public.order_items (organization_id, order_id, position, product_id, name, sku, quantity, gross_minor, discount_minor, unit_cost_e4)
  values (v_product.organization_id, v_order, 0, v_product.id, v_product.name, null, p_quantity, p_gross_minor, 0, v_product.unit_cost_e4);

  return v_order;
end;
$$;

-- Same grants as the functions of the reseller mode migration.
revoke all on function public.reseller_items(uuid, text, text) from public, anon;
grant execute on function public.reseller_items(uuid, text, text) to authenticated, service_role;
revoke all on function public.reseller_stock_summary(uuid, date) from public, anon;
grant execute on function public.reseller_stock_summary(uuid, date) to authenticated, service_role;
revoke all on function public.reseller_record_sale(uuid, uuid, integer, text, timestamptz, bigint, bigint, bigint, text) from public, anon;
grant execute on function public.reseller_record_sale(uuid, uuid, integer, text, timestamptz, bigint, bigint, bigint, text) to authenticated, service_role;
revoke all on function private.check_stock_quantity() from public, anon;
