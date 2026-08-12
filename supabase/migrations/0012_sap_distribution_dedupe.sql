-- Fix duplicate SAP storage-location buckets (AFCN: 8 AFCN: 8 -> AFCN: 8).
--
-- Some accounts imported MB52 snapshots that ended up with duplicate
-- (material, storage location) rows in sap_stock_distribution. The SAP
-- Stock screen then showed the same bucket twice and the Total Stock was
-- inflated (AFCN: 8 + AFCN: 8 = 16 instead of 8).
--
-- This migration:
--   1. collapses existing duplicates - per (user, material, storage
--      location) the kept (lowest-id) row gets the SUMMED quantity and
--      the other rows are deleted, so AFCN: 8 + AFCN: 8 -> AFCN: 8 and
--      AFCN: 8 + REVN: 2 stays as two buckets totalling 10,
--   2. guarantees a unique index so the importer can never write
--      duplicates again,
--   3. recreates v_sap_stock so the bucket list and total are computed
--      from a grouped per-SLoc aggregate - stray duplicates anywhere can
--      never inflate the numbers again.
--
-- Idempotent: safe to run more than once.

begin;

-- 1. Collapse duplicates: for every (user, material, storage location)
--    with more than one row, the kept (lowest-id) row gets the summed
--    quantity.
with dupes as (
  select
    user_id,
    material_code,
    storage_location,
    sum(quantity) as quantity,
    min(id) as keep_id
  from public.sap_stock_distribution
  group by user_id, material_code, storage_location
  having count(*) > 1
)
update public.sap_stock_distribution d
set quantity = dupes.quantity
from dupes
where d.id = dupes.keep_id;

-- Delete every duplicate row except the kept one.
delete from public.sap_stock_distribution d
using (
  select
    user_id,
    material_code,
    storage_location,
    min(id) as keep_id
  from public.sap_stock_distribution
  group by user_id, material_code, storage_location
  having count(*) > 1
) dupes
where d.user_id = dupes.user_id
  and d.material_code = dupes.material_code
  and d.storage_location = dupes.storage_location
  and d.id <> dupes.keep_id;

-- 2. Unique index (creates it if it was ever missing; by now there are
--    no duplicates left, so it cannot fail).
create unique index if not exists sap_stock_distribution_user_material_sloc_idx
  on public.sap_stock_distribution (user_id, material_code, storage_location);

-- 3. v_sap_stock rebuilt from the per-SLoc aggregate: each storage
--    location appears exactly once with the summed quantity, so the
--    bucket list and Total Stock are correct even if the table ever
--    contains duplicate rows again.
create or replace view public.v_sap_stock as
with codes as (
  select material_code
  from public.sap_stock_distribution
  where user_id = auth.uid()
  union
  select material_code
  from public.stock_reconciliation_reviews
  where status = 'open' and user_id = auth.uid()
),
dist as (
  select material_code, storage_location, sum(quantity) as quantity
  from public.sap_stock_distribution
  where user_id = auth.uid()
  group by material_code, storage_location
)
select
  c.material_code,
  coalesce(max(m.short_description), '') as short_description,
  coalesce(max(m.uom), '') as uom,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'storage_location', d.storage_location,
        'quantity', d.quantity
      )
      order by d.storage_location
    ) filter (where d.storage_location is not null),
    '[]'::jsonb
  ) as locations,
  coalesce(sum(d.quantity), 0) as total,
  (
    select to_jsonb(r)
    from public.stock_reconciliation_reviews r
    where r.material_code = c.material_code
      and r.status = 'open'
      and r.user_id = auth.uid()
    order by r.created_at desc
    limit 1
  ) as review
from codes c
left join dist d
  on d.material_code = c.material_code
left join public.material_master m
  on m.material_code = c.material_code
group by c.material_code;

grant select on public.v_sap_stock to authenticated, anon;

commit;
