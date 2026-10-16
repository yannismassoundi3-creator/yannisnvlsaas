-- =============================================================================
-- CSV imports: jobs and staged rows.
--
-- Flow: the browser parses the file and sends mapped cells in chunks; the
-- server validates and normalises each row and stores it here with its errors.
-- Nothing reaches the business tables until the user confirms; committing
-- links every created record to its import job so the import can be undone.
-- =============================================================================

alter table public.import_jobs
  add column kind text not null check (kind in ('orders', 'products', 'expenses', 'ad_spend')),
  add column status text not null default 'staging'
    check (status in ('staging', 'validated', 'committing', 'committed', 'failed', 'rolled_back', 'cancelled')),
  add column file_name text not null check (char_length(file_name) between 1 and 255),
  add column file_size_bytes bigint check (file_size_bytes between 0 and 1073741824),
  add column mapping jsonb not null default '{}'::jsonb check (octet_length(mapping::text) <= 8192),
  add column options jsonb not null default '{}'::jsonb check (octet_length(options::text) <= 4096),
  add column total_rows integer not null default 0 check (total_rows >= 0),
  add column valid_rows integer not null default 0 check (valid_rows >= 0),
  add column invalid_rows integer not null default 0 check (invalid_rows >= 0),
  add column duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  add column inserted_count integer not null default 0 check (inserted_count >= 0),
  add column updated_count integer not null default 0 check (updated_count >= 0),
  add column skipped_count integer not null default 0 check (skipped_count >= 0),
  add column error_message text check (error_message is null or char_length(error_message) <= 2000),
  add column created_by uuid references auth.users (id) on delete set null,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column validated_at timestamptz,
  add column committed_at timestamptz,
  add column rolled_back_at timestamptz;

create index import_jobs_store_created_idx on public.import_jobs (store_id, created_at desc);

create trigger import_jobs_touch before update on public.import_jobs
  for each row execute function private.touch_updated_at();

create table public.import_rows (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  import_job_id uuid not null,
  row_number integer not null check (row_number > 0),
  status text not null check (status in ('valid', 'invalid', 'duplicate', 'imported', 'updated', 'skipped')),
  -- Normalised values for valid rows (amounts in minor units, dates in ISO form).
  data jsonb check (data is null or octet_length(data::text) <= 16384),
  -- The mapped cells as received, so errors can be shown next to the original values.
  raw jsonb not null check (octet_length(raw::text) <= 16384),
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  -- Natural key used for duplicate detection (e.g. order number + line).
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 400),
  -- Snapshot of a record before an "update existing" import changed it.
  previous jsonb,
  unique (import_job_id, row_number),
  foreign key (import_job_id, organization_id) references public.import_jobs (id, organization_id) on delete cascade
);
create index import_rows_job_status_idx on public.import_rows (import_job_id, status);
create index import_rows_job_key_idx on public.import_rows (import_job_id, dedupe_key);

alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;

create policy "Members read import jobs" on public.import_jobs
  for select to authenticated using (private.is_org_member(organization_id));
create policy "Members create import jobs while access is active" on public.import_jobs
  for insert to authenticated with check (private.org_can_write(organization_id) and created_by = (select auth.uid()));
create policy "Members update import jobs while access is active" on public.import_jobs
  for update to authenticated using (private.is_org_member(organization_id)) with check (private.org_can_write(organization_id));
create policy "Members delete import jobs" on public.import_jobs
  for delete to authenticated using (private.is_org_member(organization_id));

create policy "Members read import rows" on public.import_rows
  for select to authenticated using (private.is_org_member(organization_id));
create policy "Members stage import rows while access is active" on public.import_rows
  for insert to authenticated with check (private.org_can_write(organization_id));
create policy "Members update import rows while access is active" on public.import_rows
  for update to authenticated using (private.is_org_member(organization_id)) with check (private.org_can_write(organization_id));
create policy "Members delete import rows" on public.import_rows
  for delete to authenticated using (private.is_org_member(organization_id));

revoke all on public.import_jobs, public.import_rows from anon, authenticated;
grant select, insert, update, delete on public.import_jobs, public.import_rows to authenticated;
grant all on public.import_jobs, public.import_rows to service_role;
