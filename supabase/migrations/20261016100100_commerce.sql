-- =============================================================================
-- Commerce data: products, orders, line items, refunds, expenses, advertising.
--
-- Money: bigint minor units of the store currency (EUR cents, JPY yen).
-- Unit costs: bigint e4 (major unit × 10,000) for sub-cent precision.
-- All amounts exclude sales tax / VAT; tax-inclusive inputs are converted by
-- the application before they are stored (see src/lib/finance/tax.ts).
-- =============================================================================

-- Import jobs are referenced by the records they create (created here so the
-- foreign keys below can point to them; columns are completed in the imports
-- migration).
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null,
  unique (id, organization_id),
  foreign key (store_id, organization_id) references public.stores (id, organization_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null,
  sku text check (sku is null or char_length(sku) between 1 and 100),
  name text not null check (char_length(btrim(name)) between 1 and 300),
  -- Identity used to match order lines to products: SKU when present, else name.
  match_key text generated always as (
    lower(coalesce(nullif(btrim(sku), ''), 'name:' || btrim(name)))
  ) stored,
  unit_cost_e4 bigint check (unit_cost_e4 between 0 and 1000000000000),
  price_minor bigint check (price_minor between 0 and 1000000000000),
  archived_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'csv', 'demo', 'shopify')),
  import_job_id uuid references public.import_jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (store_id, match_key),
  foreign key (store_id, organization_id) references public.stores (id, organization_id) on delete cascade
);
create index products_store_name_idx on public.products (store_id, lower(name));
create index products_import_idx on public.products (import_job_id) where import_job_id is not null;

create trigger products_touch before update on public.products
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Orders and line items
-- -----------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null,
  external_id text not null check (char_length(btrim(external_id)) between 1 and 100),
  ordered_at timestamptz not null,
  shipping_charged_minor bigint not null default 0 check (shipping_charged_minor between 0 and 1000000000000),
  shipping_cost_minor bigint check (shipping_cost_minor between 0 and 1000000000000),
  transaction_fees_minor bigint check (transaction_fees_minor between 0 and 1000000000000),
  taxes_minor bigint not null default 0 check (taxes_minor between 0 and 1000000000000),
  -- True when amounts were entered tax-inclusive and converted on the way in.
  converted_from_tax_inclusive boolean not null default false,
  note text check (note is null or char_length(note) <= 500),
  source text not null default 'manual' check (source in ('manual', 'csv', 'demo', 'shopify')),
  import_job_id uuid references public.import_jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  -- An order number identifies an order within a store: re-imports never double count.
  unique (store_id, external_id),
  foreign key (store_id, organization_id) references public.stores (id, organization_id) on delete cascade
);
create index orders_store_date_idx on public.orders (store_id, ordered_at);
create index orders_import_idx on public.orders (import_job_id) where import_job_id is not null;

create trigger orders_touch before update on public.orders
  for each row execute function private.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null,
  position integer not null check (position between 0 and 999),
  product_id uuid,
  sku text check (sku is null or char_length(sku) <= 100),
  name text not null check (char_length(name) between 1 and 300),
  quantity integer not null check (quantity between 1 and 1000000),
  gross_minor bigint not null check (gross_minor between 0 and 1000000000000),
  discount_minor bigint not null default 0 check (discount_minor >= 0 and discount_minor <= gross_minor),
  unit_cost_e4 bigint check (unit_cost_e4 between 0 and 1000000000000),
  unique (order_id, position),
  foreign key (order_id, organization_id) references public.orders (id, organization_id) on delete cascade,
  foreign key (product_id, organization_id) references public.products (id, organization_id) on delete set null (product_id)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id) where product_id is not null;

-- -----------------------------------------------------------------------------
-- Refunds
-- -----------------------------------------------------------------------------
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null,
  order_id uuid,
  external_id text check (external_id is null or char_length(external_id) between 1 and 120),
  refunded_at timestamptz not null,
  -- True when the refund date was unknown and the order date was used instead.
  date_estimated boolean not null default false,
  amount_minor bigint not null check (amount_minor between 1 and 1000000000000),
  reason text check (reason is null or char_length(reason) <= 300),
  source text not null default 'manual' check (source in ('manual', 'csv', 'demo', 'shopify')),
  import_job_id uuid references public.import_jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (store_id, organization_id) references public.stores (id, organization_id) on delete cascade,
  foreign key (order_id, organization_id) references public.orders (id, organization_id) on delete cascade
);
create unique index refunds_store_external_idx on public.refunds (store_id, external_id) where external_id is not null;
create index refunds_store_date_idx on public.refunds (store_id, refunded_at);
create index refunds_order_idx on public.refunds (order_id) where order_id is not null;

create trigger refunds_touch before update on public.refunds
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Expenses
-- -----------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null,
  incurred_on date not null,
  category text not null check (category in (
    'shipping', 'packaging', 'payment_fees', 'marketplace_fees', 'fulfilment', 'marketing_other',
    'software', 'staff', 'rent', 'professional_services', 'other')),
  kind text not null check (kind in ('variable', 'fixed')),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000000),
  description text check (description is null or char_length(description) <= 300),
  -- Used to flag likely duplicates when importing.
  fingerprint text generated always as (
    -- (date - date) is an integer, which keeps the expression immutable.
    md5((incurred_on - date '2000-01-01')::text || '|' || category || '|' || amount_minor::text || '|' || lower(btrim(coalesce(description, ''))))
  ) stored,
  source text not null default 'manual' check (source in ('manual', 'csv', 'demo', 'shopify')),
  import_job_id uuid references public.import_jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (store_id, organization_id) references public.stores (id, organization_id) on delete cascade
);
create index expenses_store_date_idx on public.expenses (store_id, incurred_on);
create index expenses_fingerprint_idx on public.expenses (store_id, fingerprint);

create trigger expenses_touch before update on public.expenses
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Advertising
-- -----------------------------------------------------------------------------
create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null,
  platform text not null check (platform in ('meta', 'google', 'tiktok', 'pinterest', 'microsoft', 'other')),
  external_id text check (external_id is null or char_length(external_id) between 1 and 120),
  name text not null check (char_length(btrim(name)) between 1 and 300),
  match_key text generated always as (
    lower(coalesce(nullif(btrim(external_id), ''), 'name:' || btrim(name)))
  ) stored,
  -- Optional: a campaign promoting a single product, so its spend can be attributed.
  product_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (store_id, platform, match_key),
  foreign key (store_id, organization_id) references public.stores (id, organization_id) on delete cascade,
  foreign key (product_id, organization_id) references public.products (id, organization_id) on delete set null (product_id)
);

create trigger ad_campaigns_touch before update on public.ad_campaigns
  for each row execute function private.touch_updated_at();

create table public.ad_spend_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null,
  campaign_id uuid not null,
  spend_date date not null,
  spend_minor bigint not null check (spend_minor between 0 and 1000000000000),
  impressions bigint not null default 0 check (impressions between 0 and 1000000000000),
  clicks bigint not null default 0 check (clicks between 0 and 1000000000000),
  conversions numeric(14, 2) not null default 0 check (conversions between 0 and 1000000000),
  conversion_value_minor bigint not null default 0 check (conversion_value_minor between 0 and 1000000000000),
  source text not null default 'manual' check (source in ('manual', 'csv', 'demo', 'meta', 'google')),
  import_job_id uuid references public.import_jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, spend_date),
  foreign key (store_id, organization_id) references public.stores (id, organization_id) on delete cascade,
  foreign key (campaign_id, organization_id) references public.ad_campaigns (id, organization_id) on delete cascade
);
create index ad_spend_store_date_idx on public.ad_spend_daily (store_id, spend_date);

create trigger ad_spend_touch before update on public.ad_spend_daily
  for each row execute function private.touch_updated_at();

-- A campaign's store must match the spend row's store.
create or replace function private.validate_ad_spend()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.ad_campaigns c where c.id = new.campaign_id and c.store_id = new.store_id) then
    raise exception 'Campaign does not belong to this store' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger ad_spend_validate before insert or update on public.ad_spend_daily
  for each row execute function private.validate_ad_spend();

-- Same-store guarantees for links between records. Field references are kept
-- inside per-table branches: PL/pgSQL resolves NEW.<field> when an expression
-- runs, so a combined condition would fail on tables without that column.
create or replace function private.validate_same_store()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'order_items' then
    if new.product_id is not null and not exists (
      select 1 from public.orders o join public.products p on p.store_id = o.store_id
      where o.id = new.order_id and p.id = new.product_id
    ) then
      raise exception 'Product and order belong to different stores' using errcode = '23503';
    end if;
  elsif tg_table_name = 'refunds' then
    if new.order_id is not null and not exists (
      select 1 from public.orders o where o.id = new.order_id and o.store_id = new.store_id
    ) then
      raise exception 'Refund and order belong to different stores' using errcode = '23503';
    end if;
  elsif tg_table_name = 'ad_campaigns' then
    if new.product_id is not null and not exists (
      select 1 from public.products p where p.id = new.product_id and p.store_id = new.store_id
    ) then
      raise exception 'Campaign and product belong to different stores' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;
create trigger order_items_same_store before insert or update on public.order_items
  for each row execute function private.validate_same_store();
create trigger refunds_same_store before insert or update on public.refunds
  for each row execute function private.validate_same_store();
create trigger ad_campaigns_same_store before insert or update on public.ad_campaigns
  for each row execute function private.validate_same_store();

-- -----------------------------------------------------------------------------
-- Row Level Security: members read; writes need active access; deletes always allowed.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['products', 'orders', 'order_items', 'refunds', 'expenses', 'ad_campaigns', 'ad_spend_daily']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Members read %1$s" on public.%1$I for select to authenticated using (private.is_org_member(organization_id))', t);
    execute format('create policy "Members insert %1$s while access is active" on public.%1$I for insert to authenticated with check (private.org_can_write(organization_id))', t);
    execute format('create policy "Members update %1$s while access is active" on public.%1$I for update to authenticated using (private.is_org_member(organization_id)) with check (private.org_can_write(organization_id))', t);
    execute format('create policy "Members delete %1$s" on public.%1$I for delete to authenticated using (private.is_org_member(organization_id))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

-- Note: generated columns (match_key, fingerprint) cannot be written by anyone;
-- PostgreSQL rejects non-default values for them.
