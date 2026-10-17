-- =============================================================================
-- Sales received by email.
--
-- Sellers forward their own sale-notification emails (Vinted, Leboncoin, eBay,
-- Vestiaire Collective) to a private address. The inbound email provider
-- (Postmark) posts each message to /api/inbound/email, which stores a pending
-- entry; the seller confirms it, which records the sale. No platform is ever
-- scraped or called.
--
--   stores.inbound_token   secret part of the store's inbound address
--   inbound_emails         one row per received message, idempotent per store
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Inbound token: 32 random hexadecimal characters (122 bits from
-- gen_random_uuid), lower case so it survives mail systems that lower-case
-- addresses. Members can read it (to display the address); nobody can write it
-- through the API except with regenerate_inbound_token().
-- -----------------------------------------------------------------------------
alter table public.stores
  add column inbound_token text unique default replace(gen_random_uuid()::text, '-', '')
    check (inbound_token is null or inbound_token ~ '^[a-z0-9]{20,64}$');
comment on column public.stores.inbound_token is 'Secret token of the store''s inbound email address. Rotated with regenerate_inbound_token().';

-- Existing stores get a token too (the default is volatile, so each row gets its own).
update public.stores set inbound_token = replace(gen_random_uuid()::text, '-', '') where inbound_token is null;

/*
 * Replaces a store's inbound token, so the old address stops working.
 * Owners and admins only, while the trial or subscription is active.
 */
create or replace function public.regenerate_inbound_token(p_store_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  select s.organization_id into v_org from public.stores s where s.id = p_store_id;
  if v_org is null or private.org_role(v_org) is null then
    raise exception 'Store not found' using errcode = '42501';
  end if;
  if private.org_role(v_org) not in ('owner', 'admin') then
    raise exception 'Only owners and admins can change the inbound address' using errcode = '42501';
  end if;
  if not private.org_can_write(v_org) then
    raise exception 'Editing is paused because the trial or subscription has ended' using errcode = '42501';
  end if;
  update public.stores set inbound_token = v_token where id = p_store_id;
  return v_token;
end;
$$;
revoke all on function public.regenerate_inbound_token(uuid) from public, anon;
grant execute on function public.regenerate_inbound_token(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Received emails
-- -----------------------------------------------------------------------------
create table public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  store_id uuid not null,
  received_at timestamptz not null default now(),
  -- Provider message id (or a hash of the message when absent): makes deliveries idempotent per store.
  message_id text not null check (char_length(message_id) between 1 and 300),
  from_address text check (from_address is null or char_length(from_address) <= 320),
  subject text check (subject is null or char_length(subject) <= 500),
  platform text check (platform is null or platform in ('vinted', 'leboncoin', 'ebay', 'vestiaire_collective')),
  kind text not null check (kind in ('sale', 'gmail_verification', 'other')),
  parsed_title text check (parsed_title is null or char_length(parsed_title) <= 300),
  parsed_amount_minor bigint check (parsed_amount_minor is null or parsed_amount_minor between 0 and 1000000000000),
  -- Gmail forwarding confirmation (kind = 'gmail_verification').
  verification_code text check (verification_code is null or char_length(verification_code) <= 40),
  verification_url text check (verification_url is null or (char_length(verification_url) <= 1000 and verification_url like 'https://%')),
  -- At most 2,000 characters, without email addresses, phone numbers or postal-address lines.
  text_excerpt text check (text_excerpt is null or char_length(text_excerpt) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, message_id),
  foreign key (store_id, organization_id) references public.stores (id, organization_id) on delete cascade,
  foreign key (order_id, organization_id) references public.orders (id, organization_id) on delete set null (order_id)
);
create index inbound_emails_pending_idx on public.inbound_emails (store_id, received_at desc) where status = 'pending';
create index inbound_emails_received_idx on public.inbound_emails (received_at);

create trigger inbound_emails_touch before update on public.inbound_emails
  for each row execute function private.touch_updated_at();

-- A confirmed email can only point to an order of its own store.
create or replace function private.validate_inbound_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.order_id is not null and not exists (
    select 1 from public.orders o where o.id = new.order_id and o.store_id = new.store_id
  ) then
    raise exception 'Email and order belong to different stores' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger inbound_emails_same_store before insert or update on public.inbound_emails
  for each row execute function private.validate_inbound_email();

-- Members read and update (confirm or dismiss) their stores' emails; only the
-- server (service role, after verifying the provider's credentials) inserts.
alter table public.inbound_emails enable row level security;
create policy "Members read inbound emails" on public.inbound_emails
  for select to authenticated using (private.is_org_member(organization_id));
create policy "Members confirm or dismiss inbound emails while access is active" on public.inbound_emails
  for update to authenticated
  using (private.is_org_member(organization_id))
  with check (private.org_can_write(organization_id));

revoke all on public.inbound_emails from anon, authenticated;
grant select on public.inbound_emails to authenticated;
grant update (status, order_id) on public.inbound_emails to authenticated;
grant all on public.inbound_emails to service_role;

-- -----------------------------------------------------------------------------
-- Retention (run daily by /api/cron/maintenance): confirmed and dismissed
-- emails are deleted after 30 days, pending ones after 90.
-- -----------------------------------------------------------------------------
create or replace function public.prune_inbound_emails()
returns integer
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.inbound_emails
    where (status in ('confirmed', 'dismissed') and received_at < now() - interval '30 days')
       or (status = 'pending' and received_at < now() - interval '90 days')
    returning 1
  )
  select count(*)::integer from deleted;
$$;
revoke all on function public.prune_inbound_emails() from public, anon, authenticated;
grant execute on function public.prune_inbound_emails() to service_role;
