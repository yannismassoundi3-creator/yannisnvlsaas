-- =============================================================================
-- Narixia foundation: tenancy, stores, billing state and access control.
--
-- Tenancy model
--   auth.users 1─* organization_members *─1 organizations 1─* stores
-- Every tenant-owned row carries organization_id. Composite foreign keys
-- (id, organization_id) make it impossible to link rows across organisations.
-- Row Level Security restricts every table to members of its organisation.
-- Helper functions live in the "private" schema, which is not exposed through
-- the Data API.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Never expose objects to anonymous visitors by default.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon, public;
alter default privileges in schema public revoke all on sequences from anon;

-- -----------------------------------------------------------------------------
-- Commercial constants. Mirrored in src/config/plans.ts; a database test keeps
-- the two in sync.
-- -----------------------------------------------------------------------------
create or replace function private.trial_period()
returns interval language sql immutable as $$ select interval '14 days' $$;

create or replace function private.payment_grace_period()
returns interval language sql immutable as $$ select interval '7 days' $$;

-- updated_at maintenance
create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per user. Created automatically on sign-up.';

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Organisations and membership
-- -----------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'member');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + private.trial_period()),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.organizations.trial_ends_at is 'Set at creation. Not writable by users.';

create trigger organizations_touch before update on public.organizations
  for each row execute function private.touch_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- -----------------------------------------------------------------------------
-- Billing state (written only by the server through verified Stripe webhooks)
-- -----------------------------------------------------------------------------
create table public.billing_customers (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id like 'cus\_%'),
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id text primary key check (id like 'sub\_%'),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
  plan text not null default 'pro' check (plan in ('pro')),
  price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_at timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  trial_end timestamptz,
  -- When the subscription first became past_due; drives the grace period.
  past_due_since timestamptz,
  -- Stripe "created" time of the event that produced this state; older events are ignored.
  stripe_event_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_org_idx on public.subscriptions (organization_id);

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function private.touch_updated_at();

-- Audit trail and idempotency record for every Stripe webhook delivery.
create table public.billing_events (
  id text primary key check (id like 'evt\_%'),
  type text not null,
  organization_id uuid references public.organizations (id) on delete set null,
  stripe_created_at timestamptz not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error text,
  -- Minimal, non-sensitive summary (ids, statuses, amounts). Never card data.
  summary jsonb not null default '{}'::jsonb check (octet_length(summary::text) <= 4096),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index billing_events_org_idx on public.billing_events (organization_id, received_at desc);

-- -----------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER to avoid RLS recursion; not exposed via API)
-- -----------------------------------------------------------------------------
create or replace function private.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.org_role(p_org uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.organization_members m
  where m.organization_id = p_org and m.user_id = (select auth.uid());
$$;

/*
 * Effective access level of an organisation:
 *   'pro'      active or trialing Stripe subscription
 *   'grace'    past_due, within the payment grace period
 *   'trial'    no paid subscription, app trial not yet ended
 *   'expired'  everything else (data remains readable and deletable)
 */
create or replace function private.org_access(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.subscriptions s
      where s.organization_id = p_org and s.status in ('active', 'trialing')
    ) then 'pro'
    when exists (
      select 1 from public.subscriptions s
      where s.organization_id = p_org and s.status = 'past_due'
        and coalesce(s.past_due_since, s.updated_at) + private.payment_grace_period() > now()
    ) then 'grace'
    when exists (
      select 1 from public.organizations o where o.id = p_org and o.trial_ends_at > now()
    ) then 'trial'
    else 'expired'
  end;
$$;

-- Inserts and updates of business data require a live trial or subscription.
create or replace function private.org_can_write(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_org_member(p_org) and private.org_access(p_org) <> 'expired';
$$;

grant execute on function private.is_org_member(uuid) to authenticated, service_role;
grant execute on function private.org_role(uuid) to authenticated, service_role;
grant execute on function private.org_access(uuid) to authenticated, service_role;
grant execute on function private.org_can_write(uuid) to authenticated, service_role;
grant execute on function private.trial_period() to authenticated, service_role;
grant execute on function private.payment_grace_period() to authenticated, service_role;

-- Entitlements as seen by members (computed, never stored).
create or replace view public.organization_entitlements
with (security_invoker = true)
as
select
  o.id as organization_id,
  private.org_access(o.id) as access,
  o.trial_started_at,
  o.trial_ends_at,
  s.id as subscription_id,
  s.status as subscription_status,
  s.current_period_end,
  s.cancel_at_period_end,
  s.cancel_at,
  s.past_due_since,
  case when s.past_due_since is not null then s.past_due_since + private.payment_grace_period() end as grace_ends_at
from public.organizations o
left join lateral (
  select * from public.subscriptions s
  where s.organization_id = o.id
  order by (s.status in ('active', 'trialing', 'past_due')) desc, s.created_at desc
  limit 1
) s on true;

-- -----------------------------------------------------------------------------
-- Stores
-- -----------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  platform text not null default 'other'
    check (platform in ('shopify', 'woocommerce', 'prestashop', 'wix', 'squarespace', 'etsy', 'amazon', 'other')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  -- ISO 4217 minor-unit digits, computed by the application from CLDR data.
  minor_digits smallint not null check (minor_digits between 0 and 4),
  timezone text not null check (char_length(timezone) between 1 and 64),
  prices_include_tax boolean not null default false,
  fee_rule_bps integer check (fee_rule_bps between 0 and 10000),
  fee_rule_fixed_minor bigint check (fee_rule_fixed_minor between 0 and 100000000),
  default_shipping_cost_minor bigint check (default_shipping_cost_minor between 0 and 100000000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index stores_org_idx on public.stores (organization_id);

create trigger stores_touch before update on public.stores
  for each row execute function private.touch_updated_at();

create or replace function private.validate_store()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id then
      raise exception 'A store cannot move to another organisation' using errcode = '42501';
    end if;
    if new.is_demo <> old.is_demo then
      raise exception 'The demo flag cannot be changed' using errcode = '42501';
    end if;
    if (new.currency <> old.currency or new.minor_digits <> old.minor_digits) then
      raise exception 'The currency of a store cannot be changed once it is created' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger stores_validate before insert or update on public.stores
  for each row execute function private.validate_store();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.stores enable row level security;

create policy "Users read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Users update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Members read their organisation" on public.organizations
  for select to authenticated using (private.is_org_member(id));
create policy "Owners and admins rename their organisation" on public.organizations
  for update to authenticated
  using (private.org_role(id) in ('owner', 'admin'))
  with check (private.org_role(id) in ('owner', 'admin'));

create policy "Members read memberships of their organisations" on public.organization_members
  for select to authenticated using (user_id = (select auth.uid()) or private.is_org_member(organization_id));

create policy "Members read their subscription" on public.subscriptions
  for select to authenticated using (private.is_org_member(organization_id));
-- billing_customers and billing_events: no policies, server (service role) only.

create policy "Members read stores" on public.stores
  for select to authenticated using (private.is_org_member(organization_id));
create policy "Members create stores while access is active" on public.stores
  for insert to authenticated with check (private.org_can_write(organization_id));
create policy "Members update stores while access is active" on public.stores
  for update to authenticated
  using (private.is_org_member(organization_id))
  with check (private.org_can_write(organization_id));
create policy "Owners and admins delete stores" on public.stores
  for delete to authenticated using (private.org_role(organization_id) in ('owner', 'admin'));

-- -----------------------------------------------------------------------------
-- Privileges. RLS decides which rows; grants decide which operations/columns.
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.organizations, public.organization_members,
  public.billing_customers, public.subscriptions, public.billing_events, public.stores
  from anon, authenticated;

grant select, update (full_name) on public.profiles to authenticated;
grant select, update (name) on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.organization_entitlements to authenticated;
grant select, delete on public.stores to authenticated;
grant insert (organization_id, name, platform, currency, minor_digits, timezone, prices_include_tax,
  fee_rule_bps, fee_rule_fixed_minor, default_shipping_cost_minor) on public.stores to authenticated;
grant update (name, platform, timezone, prices_include_tax, fee_rule_bps, fee_rule_fixed_minor,
  default_shipping_cost_minor) on public.stores to authenticated;

grant all on public.profiles, public.organizations, public.organization_members, public.billing_customers,
  public.subscriptions, public.billing_events, public.stores to service_role;
grant select on public.organization_entitlements to service_role;

-- -----------------------------------------------------------------------------
-- Onboarding: create an organisation, owner membership and first store at once.
-- -----------------------------------------------------------------------------
create or replace function public.create_organization_with_store(
  p_organization_name text,
  p_store_name text,
  p_platform text,
  p_currency text,
  p_minor_digits smallint,
  p_timezone text,
  p_prices_include_tax boolean
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
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if exists (select 1 from public.organization_members m where m.user_id = v_user) then
    raise exception 'You already belong to an organisation' using errcode = '23505';
  end if;

  insert into public.organizations (name, created_by)
  values (btrim(p_organization_name), v_user)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_user, 'owner');

  insert into public.stores (organization_id, name, platform, currency, minor_digits, timezone, prices_include_tax)
  values (v_org, btrim(p_store_name), p_platform, p_currency, p_minor_digits, p_timezone, coalesce(p_prices_include_tax, false))
  returning id into v_store;

  return query select v_org, v_store;
end;
$$;

revoke all on function public.create_organization_with_store(text, text, text, text, smallint, text, boolean) from public, anon;
grant execute on function public.create_organization_with_store(text, text, text, text, smallint, text, boolean) to authenticated;
