-- =============================================================================
-- Offers for resellers: the free plan ("Gratuit") and the "Revendeur" plan.
--
--   Free      After the 14-day trial, an organisation whose real stores are all
--             in reseller mode and that has no live subscription keeps using
--             the reseller mode for free (access level 'free'), with at most
--             private.free_stock_limit() pieces in stock (30) across its
--             reseller stores. Sold history stays readable without limit;
--             sales, edits, deletions, photos and exports keep working. AI
--             listings and sales received by email are for paid plans only.
--   Revendeur A Stripe subscription with subscriptions.plan = 'reseller'
--             (mapped from the Stripe price by the webhook): everything in
--             reseller mode, unlimited stock. Its stores stay in reseller mode.
--   Pro       Unchanged (plan 'pro'): e-commerce and everything above.
--
-- E-commerce organisations keep the previous behaviour: read-only ('expired')
-- after the trial unless subscribed.
--
-- Everything here can be pasted in the Supabase SQL editor, after the earlier
-- migrations (reseller mode, quantities, photos and AI). The statements are
-- idempotent (create or replace, drop ... if exists), so running the file
-- twice is harmless. The application detects whether this migration has been
-- applied (organization_entitlements.paid_plan) and behaves as before until
-- it is: no free plan, and the Revendeur offer says "coming soon".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Commercial constant. Mirrored by FREE_STOCK_ITEMS in src/config/plans.ts; a
-- database test fails if the two drift apart.
-- -----------------------------------------------------------------------------
create or replace function private.free_stock_limit()
returns integer language sql immutable as $$ select 30 $$;
grant execute on function private.free_stock_limit() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Plan of a subscription: 'pro' or 'reseller' (written by the Stripe webhook
-- from the subscription's price).
-- -----------------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check check (plan in ('pro', 'reseller'));
comment on column public.subscriptions.plan is 'pro or reseller, mapped from the Stripe price by the webhook.';

-- -----------------------------------------------------------------------------
-- An organisation is "reseller only" when it has at least one real store and
-- all its real stores are in reseller mode (the sample store is ignored).
-- -----------------------------------------------------------------------------
create or replace function private.org_is_reseller_only(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.stores s where s.organization_id = p_org and not s.is_demo)
     and not exists (
       select 1 from public.stores s
       where s.organization_id = p_org and not s.is_demo and s.business_model <> 'reseller'
     );
$$;
grant execute on function private.org_is_reseller_only(uuid) to authenticated, service_role;

/*
 * Effective access level of an organisation:
 *   'pro'      active or trialing Stripe subscription (Pro or Revendeur plan)
 *   'grace'    past_due, within the payment grace period
 *   'trial'    no paid subscription, app trial not yet ended
 *   'free'     no paid subscription, trial ended, reseller stores only
 *   'expired'  everything else (data remains readable and deletable)
 * Writes are allowed at every level except 'expired' (private.org_can_write);
 * the free plan's stock limit is enforced by products_free_stock_limit below.
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
    when private.org_is_reseller_only(p_org) then 'free'
    else 'expired'
  end;
$$;

-- Plan of the live subscription ('pro' or 'reseller'; Pro wins if both exist),
-- or null without one. "Live" matches the 'pro' and 'grace' levels above.
create or replace function private.org_paid_plan(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.plan
  from public.subscriptions s
  where s.organization_id = p_org
    and (
      s.status in ('active', 'trialing')
      or (s.status = 'past_due' and coalesce(s.past_due_since, s.updated_at) + private.payment_grace_period() > now())
    )
  order by (s.plan = 'pro') desc, s.created_at desc
  limit 1;
$$;
grant execute on function private.org_paid_plan(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Entitlements as seen by members, with two new columns at the end:
--   paid_plan    'pro' or 'reseller' while access is 'pro' or 'grace', else null
--   stock_limit  pieces allowed in stock on the free plan, else null
-- (CREATE OR REPLACE VIEW may only append columns; grants are kept.)
-- -----------------------------------------------------------------------------
create or replace view public.organization_entitlements
with (security_invoker = true)
as
select
  o.id as organization_id,
  a.access,
  o.trial_started_at,
  o.trial_ends_at,
  s.id as subscription_id,
  s.status as subscription_status,
  s.current_period_end,
  s.cancel_at_period_end,
  s.cancel_at,
  s.past_due_since,
  case when s.past_due_since is not null then s.past_due_since + private.payment_grace_period() end as grace_ends_at,
  case when a.access in ('pro', 'grace') then coalesce(private.org_paid_plan(o.id), 'pro') end as paid_plan,
  case when a.access = 'free' then private.free_stock_limit() end as stock_limit
from public.organizations o
cross join lateral (select private.org_access(o.id) as access) a
left join lateral (
  select * from public.subscriptions s
  where s.organization_id = o.id
  order by (s.status in ('active', 'trialing', 'past_due')) desc, s.created_at desc
  limit 1
) s on true;

-- -----------------------------------------------------------------------------
-- Free plan: at most free_stock_limit() pieces in stock (pieces remaining > 0,
-- not archived) across the organisation's real reseller stores. Checked when
-- an item is added and when an edit adds pieces (more pieces, or an archived
-- item back in stock); fewer pieces are always accepted, so an organisation
-- above the limit after its trial can keep selling, editing and deleting.
-- Item creation is serialised per organisation, so concurrent additions
-- cannot both pass. Error: message and hint 'free_stock_limit', detail = the
-- limit; the application shows the upgrade message.
-- -----------------------------------------------------------------------------
create or replace function private.enforce_free_stock_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := private.free_stock_limit();
  v_sold bigint := 0;
  v_before bigint := 0;
  v_after bigint;
  v_others bigint;
begin
  if new.archived_at is not null then
    return new;
  end if;
  if private.org_access(new.organization_id) <> 'free' then
    return new;
  end if;
  if not exists (
    select 1 from public.stores s where s.id = new.store_id and s.business_model = 'reseller' and not s.is_demo
  ) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(sum(i.quantity), 0) into v_sold from public.order_items i where i.product_id = new.id;
    if old.archived_at is null then
      v_before := greatest(coalesce(old.stock_quantity, 1) - v_sold, 0);
    end if;
  end if;
  v_after := greatest(coalesce(new.stock_quantity, 1) - v_sold, 0);
  if v_after <= v_before then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('narixia-free-stock:' || new.organization_id::text, 0));
  select coalesce(sum(greatest(coalesce(p.stock_quantity, 1) - coalesce(u.sold, 0), 0)), 0)
    into v_others
  from public.products p
  join public.stores s on s.id = p.store_id and s.business_model = 'reseller' and not s.is_demo
  left join lateral (
    select sum(i.quantity) as sold from public.order_items i where i.product_id = p.id
  ) u on true
  where p.organization_id = new.organization_id
    and p.archived_at is null
    and p.id <> new.id;

  if v_others + v_after > v_limit then
    raise exception 'free_stock_limit'
      using errcode = 'P0001', hint = 'free_stock_limit', detail = v_limit::text;
  end if;
  return new;
end;
$$;

drop trigger if exists products_free_stock_limit on public.products;
create trigger products_free_stock_limit
  before insert or update of stock_quantity, archived_at on public.products
  for each row execute function private.enforce_free_stock_limit();

-- -----------------------------------------------------------------------------
-- The free plan and the Revendeur plan are for reseller stores: switching a
-- store to e-commerce (or creating an e-commerce store) needs Pro or the trial.
-- Error: message and hint 'ecommerce_requires_pro'.
-- -----------------------------------------------------------------------------
create or replace function private.enforce_business_model_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access text;
begin
  if new.is_demo or new.business_model <> 'ecommerce' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.business_model = 'ecommerce' then
    return new;
  end if;
  v_access := private.org_access(new.organization_id);
  if v_access = 'free' or (v_access in ('pro', 'grace') and private.org_paid_plan(new.organization_id) = 'reseller') then
    raise exception 'ecommerce_requires_pro' using errcode = 'P0001', hint = 'ecommerce_requires_pro';
  end if;
  return new;
end;
$$;

drop trigger if exists stores_business_model_plan on public.stores;
create trigger stores_business_model_plan
  before insert or update of business_model on public.stores
  for each row execute function private.enforce_business_model_plan();

-- -----------------------------------------------------------------------------
-- Listings written with AI: paid plans and the trial only. Same function as in
-- the photos and AI migration, plus the 'plan_required' refusal for 'free'.
-- -----------------------------------------------------------------------------
create or replace function public.reserve_listing_analysis(p_organization_id uuid, p_limit integer)
returns table (remaining integer, period date)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := (select auth.uid());
  v_period date := date_trunc('month', now() at time zone 'utc')::date;
  v_used integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_limit is null or p_limit < 0 or p_limit > 10000 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;
  if not private.org_can_write(p_organization_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if private.org_access(p_organization_id) = 'free' then
    raise exception 'plan_required' using errcode = '42501', hint = 'plan_required';
  end if;
  if p_limit = 0 then
    raise exception 'quota_exhausted';
  end if;

  insert into public.ai_usage as u (organization_id, period, used)
  values (p_organization_id, v_period, 1)
  on conflict (organization_id, period) do update
    set used = u.used + 1, updated_at = now()
    where u.used < p_limit
  returning u.used into v_used;

  if v_used is null then
    raise exception 'quota_exhausted';
  end if;
  return query select greatest(p_limit - v_used, 0), v_period;
end;
$$;

revoke all on function public.reserve_listing_analysis(uuid, integer) from public, anon;
grant execute on function public.reserve_listing_analysis(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Sales received by email: paid plans and the trial only. The webhook route
-- checks first and answers 403; this trigger keeps the rule for any insert.
-- -----------------------------------------------------------------------------
create or replace function private.enforce_inbound_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.org_access(new.organization_id) = 'free' then
    raise exception 'plan_required' using errcode = '42501', hint = 'plan_required';
  end if;
  return new;
end;
$$;

drop trigger if exists inbound_emails_plan on public.inbound_emails;
create trigger inbound_emails_plan
  before insert on public.inbound_emails
  for each row execute function private.enforce_inbound_plan();

revoke all on function private.enforce_free_stock_limit() from public, anon;
revoke all on function private.enforce_business_model_plan() from public, anon;
revoke all on function private.enforce_inbound_plan() from public, anon;
