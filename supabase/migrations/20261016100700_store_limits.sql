-- =============================================================================
-- Plan limit on the number of real (non-sample) stores per organisation,
-- enforced in the database so it also holds for direct API calls.
-- Mirrors PLANS[*].limits.stores in src/config/plans.ts: 1 during the trial,
-- 3 on Pro (including the payment grace period).
-- =============================================================================

create or replace function private.store_limit(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.org_access(p_org) in ('pro', 'grace') then 3 else 1 end;
$$;
grant execute on function private.store_limit(uuid) to authenticated, service_role;

create or replace function private.enforce_store_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_demo then
    return new;
  end if;
  -- Serialise store creation per organisation so concurrent inserts cannot both pass.
  perform pg_advisory_xact_lock(hashtextextended('narixia-stores:' || new.organization_id::text, 0));
  if (select count(*) from public.stores s where s.organization_id = new.organization_id and not s.is_demo)
     >= private.store_limit(new.organization_id) then
    raise exception 'Store limit reached for the current plan' using errcode = 'P0001', hint = 'store_limit';
  end if;
  return new;
end;
$$;

create trigger stores_limit before insert on public.stores
  for each row execute function private.enforce_store_limit();
