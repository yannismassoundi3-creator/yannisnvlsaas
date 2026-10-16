-- =============================================================================
-- Import pipeline: duplicate detection, batched commit and undo.
--
-- The application parses, validates and normalises every row (src/lib/imports)
-- and stages it in import_rows. These functions run as the signed-in user
-- (SECURITY INVOKER), so Row Level Security and every table constraint still
-- apply to whatever an import writes.
--
--   import_finalize(job)          staging -> validated (duplicates, counts)
--   import_commit_batch(job, n)   validated -> committing -> committed,
--                                 about n rows per call to stay well within
--                                 the API statement timeout
--   import_rollback(job)          committed / failed -> rolled_back
--
-- Re-importing the same file is safe: orders match on order number, products
-- on SKU (else name), ad spend on campaign + day, expenses on a fingerprint.
-- =============================================================================

-- Upload chunk a staged row arrived in: the rows of one order must share it.
alter table public.import_rows add column chunk integer check (chunk >= 0);

create or replace function private.lock_import_job(p_job uuid)
returns public.import_jobs
language plpgsql
set search_path = ''
as $$
declare
  j public.import_jobs;
begin
  select * into j from public.import_jobs where id = p_job for update;
  if not found then
    raise exception 'Import not found' using errcode = 'P0002';
  end if;
  return j;
end;
$$;

create or replace function private.assert_import_writable(j public.import_jobs)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.org_can_write(j.organization_id) then
    raise exception 'Imports are paused because the trial or subscription has ended'
      using errcode = '42501', hint = 'subscription_required';
  end if;
end;
$$;

-- Friendly message for a row that a constraint rejected during commit.
create or replace function private.import_error(p_state text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_array(jsonb_build_object('field', null, 'message',
    case p_state
      when '23505' then 'Conflicts with an existing record (for example the same SKU on another product).'
      when '23514' then 'A value is outside the allowed range.'
      when '23503' then 'Refers to a record that no longer exists.'
      when '22003' then 'A number is too large.'
      else 'This row could not be imported.'
    end));
$$;

-- -----------------------------------------------------------------------------
-- Finalize: duplicate detection and counts.
-- -----------------------------------------------------------------------------
create or replace function public.import_finalize(p_job uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  j public.import_jobs;
  v_update boolean;
  v_result jsonb;
begin
  j := private.lock_import_job(p_job);
  if j.status <> 'staging' then
    raise exception 'This import has already been prepared' using errcode = '55000';
  end if;
  perform private.assert_import_writable(j);
  v_update := coalesce(j.options->>'duplicates', 'skip') = 'update';

  if j.kind = 'orders' then
    -- All rows of an order must arrive in one upload chunk.
    with split as (
      select dedupe_key from public.import_rows
      where import_job_id = p_job and dedupe_key is not null and status in ('valid', 'invalid')
      group by dedupe_key
      having count(distinct chunk) > 1
    )
    update public.import_rows r
       set status = 'invalid',
           errors = r.errors || jsonb_build_array(jsonb_build_object('field', 'order_number',
             'message', 'The rows of this order were split across the upload. Import the file again.'))
      from split
     where r.import_job_id = p_job and r.status in ('valid', 'invalid') and r.dedupe_key = split.dedupe_key;

    -- An order is imported whole or not at all: partial orders would understate sales.
    with bad as (
      select distinct dedupe_key from public.import_rows
      where import_job_id = p_job and status = 'invalid' and dedupe_key is not null
    )
    update public.import_rows r
       set status = 'invalid',
           errors = r.errors || jsonb_build_array(jsonb_build_object('field', null,
             'message', 'Another row of this order has an error, so the whole order was held back.'))
      from bad
     where r.import_job_id = p_job and r.status = 'valid' and r.dedupe_key = bad.dedupe_key;

    update public.import_rows r
       set status = case when v_update then 'valid' else 'duplicate' end,
           warnings = r.warnings || jsonb_build_array(jsonb_build_object('field', 'order_number',
             'message', case when v_update then 'This order already exists and will be replaced by the imported version.'
                             else 'This order already exists and will be skipped.' end))
     where r.import_job_id = p_job and r.status = 'valid'
       and exists (select 1 from public.orders o where o.store_id = j.store_id and o.external_id = r.dedupe_key);

  elsif j.kind = 'products' then
    update public.import_rows r
       set dedupe_key = lower(coalesce(nullif(btrim(r.data->>'sku'), ''), 'name:' || btrim(r.data->>'name')))
     where r.import_job_id = p_job and r.status = 'valid';

    with ranked as (
      select id, row_number, first_value(row_number) over (partition by dedupe_key order by row_number) as first_row
      from public.import_rows
      where import_job_id = p_job and status = 'valid'
    )
    update public.import_rows r
       set status = 'duplicate',
           errors = r.errors || jsonb_build_array(jsonb_build_object('field', 'sku',
             'message', format('Same product as row %s. Only the first row is imported.', ranked.first_row)))
      from ranked
     where r.id = ranked.id and ranked.row_number <> ranked.first_row;

    update public.import_rows r
       set status = case when v_update then 'valid' else 'duplicate' end,
           warnings = r.warnings || jsonb_build_array(jsonb_build_object('field', 'sku',
             'message', case when v_update then 'This product already exists and will be updated.'
                             else 'This product already exists and will be skipped.' end))
     where r.import_job_id = p_job and r.status = 'valid'
       and exists (select 1 from public.products p where p.store_id = j.store_id and p.match_key = r.dedupe_key);

  elsif j.kind = 'ad_spend' then
    update public.import_rows r
       set dedupe_key = (r.data->>'platform') || '|'
             || lower(coalesce(nullif(btrim(r.data->>'campaign_external_id'), ''), 'name:' || btrim(r.data->>'campaign_name')))
             || '|' || (r.data->>'date')
     where r.import_job_id = p_job and r.status = 'valid';

    with ranked as (
      select id, row_number, first_value(row_number) over (partition by dedupe_key order by row_number) as first_row
      from public.import_rows
      where import_job_id = p_job and status = 'valid'
    )
    update public.import_rows r
       set status = 'duplicate',
           errors = r.errors || jsonb_build_array(jsonb_build_object('field', 'campaign',
             'message', format('Same campaign and day as row %s. Only the first row is imported.', ranked.first_row)))
      from ranked
     where r.id = ranked.id and ranked.row_number <> ranked.first_row;

    update public.import_rows r
       set status = case when v_update then 'valid' else 'duplicate' end,
           warnings = r.warnings || jsonb_build_array(jsonb_build_object('field', 'campaign',
             'message', case when v_update then 'Spend for this campaign and day already exists and will be replaced.'
                             else 'Spend for this campaign and day already exists and will be skipped.' end))
     where r.import_job_id = p_job and r.status = 'valid'
       and exists (
         select 1
         from public.ad_spend_daily a
         join public.ad_campaigns c on c.id = a.campaign_id
         where c.store_id = j.store_id
           and c.platform = r.data->>'platform'
           and c.match_key = lower(coalesce(nullif(btrim(r.data->>'campaign_external_id'), ''), 'name:' || btrim(r.data->>'campaign_name')))
           and a.spend_date = (r.data->>'date')::date
       );

  elsif j.kind = 'expenses' then
    -- Same expression as the expenses.fingerprint generated column.
    update public.import_rows r
       set dedupe_key = md5((((r.data->>'incurred_on')::date) - date '2000-01-01')::text || '|' || (r.data->>'category')
             || '|' || (r.data->>'amount_minor') || '|' || lower(btrim(coalesce(r.data->>'description', ''))))
     where r.import_job_id = p_job and r.status = 'valid';

    -- Identical rows within one file can be genuine (two equal purchases): flag, keep.
    with ranked as (
      select id, row_number, first_value(row_number) over (partition by dedupe_key order by row_number) as first_row
      from public.import_rows
      where import_job_id = p_job and status = 'valid'
    )
    update public.import_rows r
       set warnings = r.warnings || jsonb_build_array(jsonb_build_object('field', null,
             'message', format('Identical to row %s. Both are imported; remove one from the file if it is a duplicate.', ranked.first_row)))
      from ranked
     where r.id = ranked.id and ranked.row_number <> ranked.first_row;

    -- An identical expense already recorded is the same expense: always skipped.
    update public.import_rows r
       set status = 'duplicate',
           warnings = r.warnings || jsonb_build_array(jsonb_build_object('field', null,
             'message', 'An identical expense is already recorded and will be skipped.'))
     where r.import_job_id = p_job and r.status = 'valid'
       and exists (select 1 from public.expenses e where e.store_id = j.store_id and e.fingerprint = r.dedupe_key);
  end if;

  update public.import_jobs ij
     set status = 'validated',
         validated_at = now(),
         total_rows = c.total,
         valid_rows = c.valid,
         invalid_rows = c.invalid,
         duplicate_rows = c.duplicate
    from (
      select count(*)::integer as total,
             (count(*) filter (where status = 'valid'))::integer as valid,
             (count(*) filter (where status = 'invalid'))::integer as invalid,
             (count(*) filter (where status = 'duplicate'))::integer as duplicate
      from public.import_rows
      where import_job_id = p_job
    ) c
   where ij.id = p_job
  returning jsonb_build_object('total', c.total, 'valid', c.valid, 'invalid', c.invalid, 'duplicate', c.duplicate)
    into v_result;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Commit helpers, one per import kind. Each processes about p_limit rows.
-- A row a constraint rejects is marked invalid instead of failing the batch.
-- -----------------------------------------------------------------------------
create or replace function private.import_commit_orders(j public.import_jobs, p_limit integer, p_update boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_key text;
  v_rows integer := 0;
  v_first_row bigint;
  v_order jsonb;
  v_order_id uuid;
  v_prev jsonb;
  v_status text;
  v_line record;
  v_product uuid;
  v_match text;
  v_position integer;
  v_replace_refunds boolean;
begin
  for v_key in
    select r.dedupe_key
    from public.import_rows r
    where r.import_job_id = j.id and r.status = 'valid'
    group by r.dedupe_key
    order by min(r.row_number)
  loop
    exit when v_rows >= p_limit;

    select r.id, r.data->'order' into v_first_row, v_order
    from public.import_rows r
    where r.import_job_id = j.id and r.dedupe_key = v_key and r.status = 'valid'
    order by r.row_number
    limit 1;
    v_replace_refunds := v_order ? 'refund_minor';
    v_prev := null;

    begin
      select o.id into v_order_id from public.orders o where o.store_id = j.store_id and o.external_id = v_key for update;

      if v_order_id is not null then
        if not p_update then
          -- Became a duplicate after validation (e.g. entered manually meanwhile).
          update public.import_rows set status = 'duplicate'
          where import_job_id = j.id and dedupe_key = v_key and status = 'valid';
          continue;
        end if;

        select jsonb_build_object(
                 'order', to_jsonb(o.*),
                 'items', coalesce((select jsonb_agg(to_jsonb(i.*) order by i.position) from public.order_items i where i.order_id = o.id), '[]'::jsonb),
                 'refunds', case when v_replace_refunds
                                 then coalesce((select jsonb_agg(to_jsonb(rf.*)) from public.refunds rf where rf.order_id = o.id), '[]'::jsonb)
                            end)
          into v_prev
        from public.orders o
        where o.id = v_order_id;

        delete from public.order_items where order_id = v_order_id;
        if v_replace_refunds then
          delete from public.refunds where order_id = v_order_id;
        end if;

        -- Columns absent from the file keep their current values.
        update public.orders set
          ordered_at = (v_order->>'ordered_at')::timestamptz,
          shipping_charged_minor = coalesce((v_order->>'shipping_charged_minor')::bigint, 0),
          taxes_minor = coalesce((v_order->>'taxes_minor')::bigint, 0),
          shipping_cost_minor = case when v_order ? 'shipping_cost_minor' then (v_order->>'shipping_cost_minor')::bigint else shipping_cost_minor end,
          transaction_fees_minor = case when v_order ? 'transaction_fees_minor' then (v_order->>'transaction_fees_minor')::bigint else transaction_fees_minor end,
          converted_from_tax_inclusive = coalesce((v_order->>'converted_from_tax_inclusive')::boolean, false),
          source = 'csv',
          import_job_id = j.id
        where id = v_order_id;
        v_status := 'updated';
      else
        insert into public.orders (organization_id, store_id, external_id, ordered_at, shipping_charged_minor, taxes_minor,
                                   shipping_cost_minor, transaction_fees_minor, converted_from_tax_inclusive, source, import_job_id)
        values (j.organization_id, j.store_id, v_key, (v_order->>'ordered_at')::timestamptz,
                coalesce((v_order->>'shipping_charged_minor')::bigint, 0), coalesce((v_order->>'taxes_minor')::bigint, 0),
                (v_order->>'shipping_cost_minor')::bigint, (v_order->>'transaction_fees_minor')::bigint,
                coalesce((v_order->>'converted_from_tax_inclusive')::boolean, false), 'csv', j.id)
        returning id into v_order_id;
        v_status := 'imported';
      end if;

      v_position := 0;
      for v_line in
        select r.data->'line' as line
        from public.import_rows r
        where r.import_job_id = j.id and r.dedupe_key = v_key and r.status = 'valid'
        order by r.row_number
      loop
        -- Same expression as products.match_key: SKU when present, else the name.
        v_match := lower(coalesce(nullif(btrim(v_line.line->>'sku'), ''), 'name:' || btrim(v_line.line->>'name')));
        v_product := null;
        select p.id into v_product from public.products p where p.store_id = j.store_id and p.match_key = v_match;
        if v_product is null then
          insert into public.products (organization_id, store_id, sku, name, source, import_job_id)
          values (j.organization_id, j.store_id, nullif(btrim(v_line.line->>'sku'), ''), btrim(v_line.line->>'name'), 'csv', j.id)
          returning id into v_product;
        end if;

        insert into public.order_items (organization_id, order_id, position, product_id, sku, name, quantity, gross_minor, discount_minor, unit_cost_e4)
        values (j.organization_id, v_order_id, v_position, v_product, nullif(btrim(v_line.line->>'sku'), ''), btrim(v_line.line->>'name'),
                (v_line.line->>'quantity')::integer, (v_line.line->>'gross_minor')::bigint,
                coalesce((v_line.line->>'discount_minor')::bigint, 0), (v_line.line->>'unit_cost_e4')::bigint);
        v_position := v_position + 1;
      end loop;

      if v_replace_refunds and coalesce((v_order->>'refund_minor')::bigint, 0) > 0 then
        insert into public.refunds (organization_id, store_id, order_id, refunded_at, date_estimated, amount_minor, source, import_job_id)
        values (j.organization_id, j.store_id, v_order_id,
                coalesce((v_order->>'refunded_at')::timestamptz, (v_order->>'ordered_at')::timestamptz),
                (v_order->>'refunded_at') is null, (v_order->>'refund_minor')::bigint, 'csv', j.id);
      end if;

      update public.import_rows set status = v_status
      where import_job_id = j.id and dedupe_key = v_key and status = 'valid';
      if v_prev is not null then
        update public.import_rows set previous = v_prev where id = v_first_row;
      end if;
    exception
      when unique_violation or check_violation or foreign_key_violation or not_null_violation
           or numeric_value_out_of_range or invalid_text_representation or invalid_datetime_format then
        update public.import_rows set status = 'invalid', errors = errors || private.import_error(sqlstate)
        where import_job_id = j.id and dedupe_key = v_key and status = 'valid';
    end;

    v_rows := v_rows + (select count(*) from public.import_rows r where r.import_job_id = j.id and r.dedupe_key = v_key);
  end loop;
end;
$$;

create or replace function private.import_commit_products(j public.import_jobs, p_limit integer, p_update boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row record;
  v_existing public.products;
begin
  for v_row in
    select r.id, r.data, r.dedupe_key
    from public.import_rows r
    where r.import_job_id = j.id and r.status = 'valid'
    order by r.row_number
    limit p_limit
  loop
    begin
      select * into v_existing from public.products p where p.store_id = j.store_id and p.match_key = v_row.dedupe_key for update;
      if found then
        if not p_update then
          update public.import_rows set status = 'duplicate' where id = v_row.id;
          continue;
        end if;
        update public.products set
          name = btrim(v_row.data->>'name'),
          sku = case when v_row.data ? 'sku' then nullif(btrim(v_row.data->>'sku'), '') else sku end,
          unit_cost_e4 = case when v_row.data->>'unit_cost_e4' is not null then (v_row.data->>'unit_cost_e4')::bigint else unit_cost_e4 end,
          price_minor = case when v_row.data->>'price_minor' is not null then (v_row.data->>'price_minor')::bigint else price_minor end,
          import_job_id = j.id
        where id = v_existing.id;
        update public.import_rows set status = 'updated', previous = to_jsonb(v_existing) where id = v_row.id;
      else
        insert into public.products (organization_id, store_id, sku, name, unit_cost_e4, price_minor, source, import_job_id)
        values (j.organization_id, j.store_id, nullif(btrim(v_row.data->>'sku'), ''), btrim(v_row.data->>'name'),
                (v_row.data->>'unit_cost_e4')::bigint, (v_row.data->>'price_minor')::bigint, 'csv', j.id);
        update public.import_rows set status = 'imported' where id = v_row.id;
      end if;
    exception
      when unique_violation or check_violation or foreign_key_violation or not_null_violation
           or numeric_value_out_of_range or invalid_text_representation then
        update public.import_rows set status = 'invalid', errors = errors || private.import_error(sqlstate) where id = v_row.id;
    end;
  end loop;
end;
$$;

create or replace function private.import_commit_ad_spend(j public.import_jobs, p_limit integer, p_update boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row record;
  v_campaign uuid;
  v_existing public.ad_spend_daily;
begin
  for v_row in
    select r.id, r.data
    from public.import_rows r
    where r.import_job_id = j.id and r.status = 'valid'
    order by r.row_number
    limit p_limit
  loop
    begin
      v_campaign := null;
      select c.id into v_campaign
      from public.ad_campaigns c
      where c.store_id = j.store_id
        and c.platform = v_row.data->>'platform'
        and c.match_key = lower(coalesce(nullif(btrim(v_row.data->>'campaign_external_id'), ''), 'name:' || btrim(v_row.data->>'campaign_name')));
      if v_campaign is null then
        insert into public.ad_campaigns (organization_id, store_id, platform, external_id, name, import_job_id)
        values (j.organization_id, j.store_id, v_row.data->>'platform', nullif(btrim(v_row.data->>'campaign_external_id'), ''),
                btrim(v_row.data->>'campaign_name'), j.id)
        returning id into v_campaign;
      end if;

      select * into v_existing from public.ad_spend_daily a
      where a.campaign_id = v_campaign and a.spend_date = (v_row.data->>'date')::date
      for update;
      if found then
        if not p_update then
          update public.import_rows set status = 'duplicate' where id = v_row.id;
          continue;
        end if;
        update public.ad_spend_daily set
          spend_minor = (v_row.data->>'spend_minor')::bigint,
          impressions = coalesce((v_row.data->>'impressions')::bigint, 0),
          clicks = coalesce((v_row.data->>'clicks')::bigint, 0),
          conversions = coalesce((v_row.data->>'conversions')::numeric, 0),
          conversion_value_minor = coalesce((v_row.data->>'conversion_value_minor')::bigint, 0),
          source = 'csv',
          import_job_id = j.id
        where id = v_existing.id;
        update public.import_rows set status = 'updated', previous = to_jsonb(v_existing) where id = v_row.id;
      else
        insert into public.ad_spend_daily (organization_id, store_id, campaign_id, spend_date, spend_minor, impressions, clicks,
                                           conversions, conversion_value_minor, source, import_job_id)
        values (j.organization_id, j.store_id, v_campaign, (v_row.data->>'date')::date, (v_row.data->>'spend_minor')::bigint,
                coalesce((v_row.data->>'impressions')::bigint, 0), coalesce((v_row.data->>'clicks')::bigint, 0),
                coalesce((v_row.data->>'conversions')::numeric, 0), coalesce((v_row.data->>'conversion_value_minor')::bigint, 0),
                'csv', j.id);
        update public.import_rows set status = 'imported' where id = v_row.id;
      end if;
    exception
      when unique_violation or check_violation or foreign_key_violation or not_null_violation
           or numeric_value_out_of_range or invalid_text_representation or invalid_datetime_format then
        update public.import_rows set status = 'invalid', errors = errors || private.import_error(sqlstate) where id = v_row.id;
    end;
  end loop;
end;
$$;

create or replace function private.import_commit_expenses(j public.import_jobs, p_limit integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row record;
begin
  for v_row in
    select r.id, r.data
    from public.import_rows r
    where r.import_job_id = j.id and r.status = 'valid'
    order by r.row_number
    limit p_limit
  loop
    begin
      insert into public.expenses (organization_id, store_id, incurred_on, category, kind, amount_minor, description, source, import_job_id)
      values (j.organization_id, j.store_id, (v_row.data->>'incurred_on')::date, v_row.data->>'category', v_row.data->>'kind',
              (v_row.data->>'amount_minor')::bigint, nullif(btrim(v_row.data->>'description'), ''), 'csv', j.id);
      update public.import_rows set status = 'imported' where id = v_row.id;
    exception
      when check_violation or not_null_violation or numeric_value_out_of_range or invalid_text_representation or invalid_datetime_format then
        update public.import_rows set status = 'invalid', errors = errors || private.import_error(sqlstate) where id = v_row.id;
    end;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Commit, in batches. The first call moves the job to 'committing'; the call
-- that processes the last valid row completes it.
-- -----------------------------------------------------------------------------
create or replace function public.import_commit_batch(p_job uuid, p_limit integer default 500)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  j public.import_jobs;
  v_update boolean;
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
  v_remaining integer;
begin
  j := private.lock_import_job(p_job);
  if j.status not in ('validated', 'committing') then
    raise exception 'This import cannot be confirmed in its current state' using errcode = '55000';
  end if;
  perform private.assert_import_writable(j);
  -- One import writes to a store at a time.
  perform pg_advisory_xact_lock(hashtextextended('narixia-import:' || j.store_id::text, 0));
  if j.status = 'validated' then
    update public.import_jobs set status = 'committing' where id = p_job;
  end if;
  v_update := coalesce(j.options->>'duplicates', 'skip') = 'update';

  case j.kind
    when 'orders' then perform private.import_commit_orders(j, v_limit, v_update);
    when 'products' then perform private.import_commit_products(j, v_limit, v_update);
    when 'ad_spend' then perform private.import_commit_ad_spend(j, v_limit, v_update);
    when 'expenses' then perform private.import_commit_expenses(j, v_limit);
  end case;

  select count(*) into v_remaining from public.import_rows where import_job_id = p_job and status = 'valid';
  if v_remaining = 0 then
    update public.import_rows set status = 'skipped' where import_job_id = p_job and status = 'duplicate';
    update public.import_jobs ij
       set status = 'committed',
           committed_at = now(),
           inserted_count = c.inserted,
           updated_count = c.updated,
           skipped_count = c.skipped,
           invalid_rows = c.invalid
      from (
        select (count(*) filter (where status = 'imported'))::integer as inserted,
               (count(*) filter (where status = 'updated'))::integer as updated,
               (count(*) filter (where status = 'skipped'))::integer as skipped,
               (count(*) filter (where status = 'invalid'))::integer as invalid
        from public.import_rows
        where import_job_id = p_job
      ) c
     where ij.id = p_job;
  end if;
  return jsonb_build_object('done', v_remaining = 0, 'remaining', v_remaining);
end;
$$;

-- -----------------------------------------------------------------------------
-- Undo: removes what the import created and restores what it replaced. Only
-- the most recent import of a store can be undone, so a later import's changes
-- are never overwritten with stale values.
-- -----------------------------------------------------------------------------
create or replace function public.import_rollback(p_job uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  j public.import_jobs;
  v_prev jsonb;
  v_restored integer := 0;
  v_removed integer := 0;
begin
  j := private.lock_import_job(p_job);
  if j.status not in ('committed', 'committing', 'failed') then
    raise exception 'Only imports that were confirmed can be undone' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.import_jobs o
    where o.store_id = j.store_id and o.id <> j.id and o.status = 'committed'
      and o.committed_at > coalesce(j.committed_at, j.updated_at)
  ) then
    raise exception 'Undo the more recent imports for this store first' using errcode = '55000', hint = 'later_import';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('narixia-import:' || j.store_id::text, 0));

  if j.kind = 'orders' then
    for v_prev in
      select r.previous from public.import_rows r
      where r.import_job_id = p_job and r.status = 'updated' and r.previous is not null
    loop
      delete from public.order_items where order_id = (v_prev->'order'->>'id')::uuid;
      if jsonb_typeof(v_prev->'refunds') = 'array' then
        delete from public.refunds where order_id = (v_prev->'order'->>'id')::uuid;
        insert into public.refunds (id, organization_id, store_id, order_id, external_id, refunded_at, date_estimated, amount_minor,
                                    reason, source, import_job_id, created_at)
        select x.id, x.organization_id, x.store_id, x.order_id, x.external_id, x.refunded_at, x.date_estimated, x.amount_minor,
               x.reason, x.source, x.import_job_id, x.created_at
        from jsonb_populate_recordset(null::public.refunds, v_prev->'refunds') x;
      end if;
      update public.orders o set
        ordered_at = x.ordered_at,
        shipping_charged_minor = x.shipping_charged_minor,
        shipping_cost_minor = x.shipping_cost_minor,
        transaction_fees_minor = x.transaction_fees_minor,
        taxes_minor = x.taxes_minor,
        converted_from_tax_inclusive = x.converted_from_tax_inclusive,
        note = x.note,
        source = x.source,
        import_job_id = x.import_job_id
      from jsonb_populate_record(null::public.orders, v_prev->'order') x
      where o.id = x.id;
      insert into public.order_items (id, organization_id, order_id, position, product_id, sku, name, quantity, gross_minor, discount_minor, unit_cost_e4)
      select x.id, x.organization_id, x.order_id, x.position,
             (select p.id from public.products p where p.id = x.product_id),
             x.sku, x.name, x.quantity, x.gross_minor, x.discount_minor, x.unit_cost_e4
      from jsonb_populate_recordset(null::public.order_items, v_prev->'items') x;
      v_restored := v_restored + 1;
    end loop;

    -- Orders this import created (lines and refunds cascade).
    delete from public.orders where import_job_id = p_job;
    get diagnostics v_removed = row_count;
    delete from public.refunds where import_job_id = p_job;
    -- Products created for unknown order lines, unless they have since been given a cost or other sales.
    delete from public.products p
    where p.import_job_id = p_job and p.unit_cost_e4 is null
      and not exists (select 1 from public.order_items i where i.product_id = p.id);

  elsif j.kind = 'products' then
    for v_prev in
      select r.previous from public.import_rows r
      where r.import_job_id = p_job and r.status = 'updated' and r.previous is not null
    loop
      update public.products p set
        name = x.name,
        sku = x.sku,
        unit_cost_e4 = x.unit_cost_e4,
        price_minor = x.price_minor,
        archived_at = x.archived_at,
        source = x.source,
        import_job_id = x.import_job_id
      from jsonb_populate_record(null::public.products, v_prev) x
      where p.id = x.id;
      v_restored := v_restored + 1;
    end loop;
    delete from public.products where import_job_id = p_job;
    get diagnostics v_removed = row_count;

  elsif j.kind = 'ad_spend' then
    for v_prev in
      select r.previous from public.import_rows r
      where r.import_job_id = p_job and r.status = 'updated' and r.previous is not null
    loop
      update public.ad_spend_daily a set
        spend_minor = x.spend_minor,
        impressions = x.impressions,
        clicks = x.clicks,
        conversions = x.conversions,
        conversion_value_minor = x.conversion_value_minor,
        source = x.source,
        import_job_id = x.import_job_id
      from jsonb_populate_record(null::public.ad_spend_daily, v_prev) x
      where a.id = x.id;
      v_restored := v_restored + 1;
    end loop;
    delete from public.ad_spend_daily where import_job_id = p_job;
    get diagnostics v_removed = row_count;
    delete from public.ad_campaigns c
    where c.import_job_id = p_job and not exists (select 1 from public.ad_spend_daily a where a.campaign_id = c.id);

  elsif j.kind = 'expenses' then
    delete from public.expenses where import_job_id = p_job;
    get diagnostics v_removed = row_count;
  end if;

  update public.import_jobs set status = 'rolled_back', rolled_back_at = now() where id = p_job;
  return jsonb_build_object('removed', v_removed, 'restored', v_restored);
end;
$$;

revoke all on function private.lock_import_job(uuid) from public, anon;
revoke all on function private.assert_import_writable(public.import_jobs) from public, anon;
revoke all on function private.import_commit_orders(public.import_jobs, integer, boolean) from public, anon;
revoke all on function private.import_commit_products(public.import_jobs, integer, boolean) from public, anon;
revoke all on function private.import_commit_ad_spend(public.import_jobs, integer, boolean) from public, anon;
revoke all on function private.import_commit_expenses(public.import_jobs, integer) from public, anon;
grant execute on function private.lock_import_job(uuid) to authenticated, service_role;
grant execute on function private.assert_import_writable(public.import_jobs) to authenticated, service_role;
grant execute on function private.import_error(text) to authenticated, service_role;
grant execute on function private.import_commit_orders(public.import_jobs, integer, boolean) to authenticated, service_role;
grant execute on function private.import_commit_products(public.import_jobs, integer, boolean) to authenticated, service_role;
grant execute on function private.import_commit_ad_spend(public.import_jobs, integer, boolean) to authenticated, service_role;
grant execute on function private.import_commit_expenses(public.import_jobs, integer) to authenticated, service_role;

revoke all on function public.import_finalize(uuid) from public, anon;
revoke all on function public.import_commit_batch(uuid, integer) from public, anon;
revoke all on function public.import_rollback(uuid) from public, anon;
grant execute on function public.import_finalize(uuid) to authenticated, service_role;
grant execute on function public.import_commit_batch(uuid, integer) to authenticated, service_role;
grant execute on function public.import_rollback(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Housekeeping: abandoned uploads are cancelled after two days and their staged
-- rows deleted. Called by the maintenance endpoint (service role).
-- -----------------------------------------------------------------------------
create or replace function public.prune_abandoned_imports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with stale as (
    update public.import_jobs
       set status = 'cancelled'
     where status in ('staging', 'validated') and updated_at < now() - interval '2 days'
    returning id
  )
  delete from public.import_rows r using stale where r.import_job_id = stale.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.prune_abandoned_imports() from public, anon, authenticated;
grant execute on function public.prune_abandoned_imports() to service_role;
