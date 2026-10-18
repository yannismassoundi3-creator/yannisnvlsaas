-- =============================================================================
-- Item photos and listings written with AI (reseller mode).
--
--   products.photo_path   one small thumbnail per item (480 px square JPEG,
--                         about 30-60 KB), stored in the private bucket
--                         "item-photos" at <organization_id>/<product_id>/<uuid>.jpg
--   ai_usage              listings generated with Claude per organisation and
--                         calendar month (UTC), so the monthly cap holds across
--                         every server instance
--
-- Photos are enhanced in the browser (light, colour, framing); only the
-- thumbnail is stored. The photos sent to Claude are not stored by Narixia.
--
-- Everything here can be pasted in the Supabase SQL editor: plain DDL on
-- public objects, a row in storage.buckets and policies on storage.objects.
-- The statements are idempotent (if not exists / on conflict / drop if exists),
-- so running the file twice is harmless. The application detects whether this
-- migration has been applied and works without it (no thumbnail, and the AI
-- button says "coming soon").
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Thumbnail of an item. The path always starts with the item's organisation and
-- id, so a row can never point at another tenant's or another item's file.
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists photo_path text;

alter table public.products drop constraint if exists products_photo_path_check;
alter table public.products
  add constraint products_photo_path_check check (
    photo_path is null or (
      photo_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$'
      and split_part(photo_path, '/', 1) = organization_id::text
      and split_part(photo_path, '/', 2) = id::text
    )
  );
comment on column public.products.photo_path is
  'Reseller mode: thumbnail in the private item-photos bucket (<organization_id>/<product_id>/<uuid>.jpg). Null when the item has no photo.';

-- products has table-level grants: the new column inherits them and its RLS
-- policies (members read, writes need an active trial or subscription).

-- -----------------------------------------------------------------------------
-- Private bucket: 300 KB per file, JPEG or WebP only. Files are read through
-- short-lived signed URLs created for members of the organisation.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 307200, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Organisation and item of a photo path, or null when the path does not have
-- the expected shape (never raises, so a policy cannot error on a bad name).
create or replace function private.item_photo_org(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

create or replace function private.item_photo_product(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when private.item_photo_org(p_name) is not null then split_part(p_name, '/', 2)::uuid end;
$$;

grant execute on function private.item_photo_org(text) to authenticated, service_role;
grant execute on function private.item_photo_product(text) to authenticated, service_role;

-- Members read and delete the photos of their organisation. Uploads also need a
-- live trial or subscription (like every other write) and an existing item of
-- that organisation in the path. Nobody updates a photo in place: a new photo
-- is a new file. The service role (account deletion) bypasses these policies.
drop policy if exists "Item photos: members read" on storage.objects;
drop policy if exists "Item photos: members upload while access is active" on storage.objects;
drop policy if exists "Item photos: members delete" on storage.objects;

create policy "Item photos: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'item-photos' and private.is_org_member(private.item_photo_org(name)));

create policy "Item photos: members upload while access is active" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'item-photos'
    and private.org_can_write(private.item_photo_org(name))
    -- objects.name, not name: inside the subquery, name would be the product's name.
    and exists (
      select 1 from public.products p
      where p.id = private.item_photo_product(objects.name)
        and p.organization_id = private.item_photo_org(objects.name)
    )
  );

create policy "Item photos: members delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-photos' and private.is_org_member(private.item_photo_org(name)));

-- -----------------------------------------------------------------------------
-- Listings generated with AI: one counter per organisation and month.
-- Members read their organisation's counter (to show what is left); nobody
-- writes it through the API: the two functions below do.
-- -----------------------------------------------------------------------------
create table if not exists public.ai_usage (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, period)
);
comment on table public.ai_usage is
  'Listings generated with AI per organisation and calendar month (period = first day of the month, UTC).';

alter table public.ai_usage enable row level security;

drop policy if exists "Members read their AI usage" on public.ai_usage;
create policy "Members read their AI usage" on public.ai_usage
  for select to authenticated using (private.is_org_member(organization_id));

revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
grant select, insert, update, delete on public.ai_usage to service_role;

-- -----------------------------------------------------------------------------
-- Reserves one analysis for the caller's organisation before Claude is called.
-- The caller must be a member and the organisation must have a live trial or
-- subscription. The counter is incremented only while it is below p_limit;
-- concurrent calls serialise on the row (insert ... on conflict do update ...
-- where), so the cap is never exceeded. Raises 'quota_exhausted' otherwise.
-- Returns what is left this month and the month that was charged (to refund it).
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
-- Gives back a reserved analysis when the call to Claude failed (refusal,
-- truncated answer, error, cancellation). Server only: a member who could call
-- it would reset their own counter.
-- -----------------------------------------------------------------------------
create or replace function public.release_listing_analysis(p_organization_id uuid, p_period date)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage
  set used = used - 1, updated_at = now()
  where organization_id = p_organization_id and period = p_period and used > 0;
$$;

revoke all on function public.release_listing_analysis(uuid, date) from public, anon, authenticated;
grant execute on function public.release_listing_analysis(uuid, date) to service_role;
