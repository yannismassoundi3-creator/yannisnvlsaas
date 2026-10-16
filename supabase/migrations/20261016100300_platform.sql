-- =============================================================================
-- Platform: audit trail, privacy-conscious product events, rate limiting and
-- in-app feedback.
-- =============================================================================

-- Audit trail of sensitive actions (imports, deletions, exports, billing).
create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_type text check (target_type is null or char_length(target_type) <= 40),
  target_id text check (target_id is null or char_length(target_id) <= 120),
  metadata jsonb not null default '{}'::jsonb check (octet_length(metadata::text) <= 4096),
  created_at timestamptz not null default now()
);
create index audit_events_org_idx on public.audit_events (organization_id, created_at desc);

-- Product analytics events. Never contain financial amounts or file contents.
create table public.product_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  event text not null check (event in (
    'registration_completed', 'onboarding_completed', 'demo_store_created', 'first_import_succeeded',
    'import_committed', 'first_dashboard_result', 'trial_started', 'checkout_initiated',
    'subscription_activated', 'subscription_canceled', 'report_exported')),
  properties jsonb not null default '{}'::jsonb check (octet_length(properties::text) <= 1024),
  created_at timestamptz not null default now()
);
create index product_events_event_idx on public.product_events (event, created_at desc);
create index product_events_org_idx on public.product_events (organization_id, event);

-- Fixed-window rate limiting, shared by all server instances.
create table private.rate_limits (
  key text primary key check (char_length(key) <= 200),
  window_started_at timestamptz not null,
  hits integer not null
);

/*
 * Records one hit for `p_key` and returns true when the caller is still within
 * `p_limit` hits per `p_window_seconds`. Called by the server only.
 */
create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into private.rate_limits as r (key, window_started_at, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_started_at + make_interval(secs => p_window_seconds) <= now() then 1 else r.hits + 1 end,
        window_started_at = case when r.window_started_at + make_interval(secs => p_window_seconds) <= now() then now() else r.window_started_at end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Housekeeping: drop expired rate-limit windows (run from the maintenance cron).
create or replace function public.prune_rate_limits()
returns integer
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from private.rate_limits where window_started_at < now() - interval '1 day' returning 1
  )
  select count(*)::integer from deleted;
$$;
revoke all on function public.prune_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_rate_limits() to service_role;

-- In-app feedback.
create table public.feedback (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('question', 'bug', 'idea', 'other')),
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  page text check (page is null or char_length(page) <= 200),
  created_at timestamptz not null default now()
);

alter table public.audit_events enable row level security;
alter table public.product_events enable row level security;
alter table public.feedback enable row level security;

create policy "Members read their organisation's audit trail" on public.audit_events
  for select to authenticated using (private.is_org_member(organization_id));
create policy "Users send feedback" on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (organization_id is null or private.is_org_member(organization_id)));

revoke all on public.audit_events, public.product_events, public.feedback from anon, authenticated;
grant select on public.audit_events to authenticated;
grant insert (organization_id, user_id, kind, message, page) on public.feedback to authenticated;
grant all on public.audit_events, public.product_events, public.feedback to service_role;
