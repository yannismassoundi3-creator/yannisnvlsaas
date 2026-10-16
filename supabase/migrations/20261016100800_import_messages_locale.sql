-- =============================================================================
-- Import messages in the interface language.
--
-- import_finalize writes the duplicate and consistency messages shown on the
-- import page (import_rows.errors / warnings). The language is the one stored
-- on the job when it was created (import_jobs.options->>'locale', set by the
-- application from the request language): French when it is 'fr', English
-- otherwise, so jobs created before this change keep their English messages.
-- The function is otherwise identical to 20261016100600_import_pipeline.sql;
-- its grants are kept by CREATE OR REPLACE.
-- =============================================================================

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
             'message', case when j.options->>'locale' = 'fr' then 'Les lignes de cette commande ont été réparties sur plusieurs envois. Importez de nouveau le fichier.' else 'The rows of this order were split across the upload. Import the file again.' end))
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
             'message', case when j.options->>'locale' = 'fr' then 'Une autre ligne de cette commande contient une erreur : toute la commande a été mise de côté.' else 'Another row of this order has an error, so the whole order was held back.' end))
      from bad
     where r.import_job_id = p_job and r.status = 'valid' and r.dedupe_key = bad.dedupe_key;

    update public.import_rows r
       set status = case when v_update then 'valid' else 'duplicate' end,
           warnings = r.warnings || jsonb_build_array(jsonb_build_object('field', 'order_number',
             'message', case when v_update then case when j.options->>'locale' = 'fr' then 'Cette commande existe déjà et sera remplacée par la version importée.' else 'This order already exists and will be replaced by the imported version.' end
                             else case when j.options->>'locale' = 'fr' then 'Cette commande existe déjà et sera ignorée.' else 'This order already exists and will be skipped.' end end))
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
             'message', format(case when j.options->>'locale' = 'fr' then 'Même produit qu''à la ligne %s. Seule la première ligne est importée.' else 'Same product as row %s. Only the first row is imported.' end, ranked.first_row)))
      from ranked
     where r.id = ranked.id and ranked.row_number <> ranked.first_row;

    update public.import_rows r
       set status = case when v_update then 'valid' else 'duplicate' end,
           warnings = r.warnings || jsonb_build_array(jsonb_build_object('field', 'sku',
             'message', case when v_update then case when j.options->>'locale' = 'fr' then 'Ce produit existe déjà et sera mis à jour.' else 'This product already exists and will be updated.' end
                             else case when j.options->>'locale' = 'fr' then 'Ce produit existe déjà et sera ignoré.' else 'This product already exists and will be skipped.' end end))
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
             'message', format(case when j.options->>'locale' = 'fr' then 'Même campagne et même jour qu''à la ligne %s. Seule la première ligne est importée.' else 'Same campaign and day as row %s. Only the first row is imported.' end, ranked.first_row)))
      from ranked
     where r.id = ranked.id and ranked.row_number <> ranked.first_row;

    update public.import_rows r
       set status = case when v_update then 'valid' else 'duplicate' end,
           warnings = r.warnings || jsonb_build_array(jsonb_build_object('field', 'campaign',
             'message', case when v_update then case when j.options->>'locale' = 'fr' then 'Les dépenses de cette campagne pour ce jour existent déjà et seront remplacées.' else 'Spend for this campaign and day already exists and will be replaced.' end
                             else case when j.options->>'locale' = 'fr' then 'Les dépenses de cette campagne pour ce jour existent déjà et seront ignorées.' else 'Spend for this campaign and day already exists and will be skipped.' end end))
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
             'message', format(case when j.options->>'locale' = 'fr' then 'Identique à la ligne %s. Les deux sont importées ; supprimez-en une du fichier s''il s''agit d''un doublon.' else 'Identical to row %s. Both are imported; remove one from the file if it is a duplicate.' end, ranked.first_row)))
      from ranked
     where r.id = ranked.id and ranked.row_number <> ranked.first_row;

    -- An identical expense already recorded is the same expense: always skipped.
    update public.import_rows r
       set status = 'duplicate',
           warnings = r.warnings || jsonb_build_array(jsonb_build_object('field', null,
             'message', case when j.options->>'locale' = 'fr' then 'Une dépense identique est déjà enregistrée et sera ignorée.' else 'An identical expense is already recorded and will be skipped.' end))
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
