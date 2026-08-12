-- Server-side read views for the SAP Stock and SAP History screens.
--
-- The screens previously pulled the ENTIRE sap_stock_distribution table
-- into the browser (paginated client-side), then did per-material master
-- lookups, then rendered every row - which is why they got slower as MB51
-- / MB52 data grew. These two views move the aggregation, the running
-- balance, and the join to Material Master into Postgres so the client
-- can page (range + count=exact), filter and search server-side.
--
-- Tenant isolation: views run with the migration owner's privileges
-- (RLS on the underlying tables is bypassed), so every view definition
-- filters by auth.uid() itself - same rule as the tenant_isolation
-- policies on the source tables. material_master is a shared master
-- table (no user_id), joined without a user filter, matching how the
-- app itself reads it.
--
-- Safe to run any number of times: both statements are
-- create or replace view.

begin;

-- v_sap_stock: one row per material with an MB52 distribution (or an
-- open reconciliation review), aggregated server-side:
--   locations  - jsonb array of {storage_location, quantity}, sorted
--   total      - SAP total across storage locations
--   review     - latest open reconciliation review (jsonb) or null
-- The distribution is first grouped per (material, storage location) and
-- summed, so each SLoc bucket appears exactly once and duplicate rows in
-- sap_stock_distribution can never inflate the bucket list or the total
-- (see 0012 for the data cleanup + unique index). The union guarantees a
-- material flagged with 0 SAP stock (review only, no distribution rows)
-- still appears.
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

-- v_sap_history: MB51 movements with the per-SLoc running balance
-- computed by a window function (partitioned by material + storage
-- location, ordered chronologically). Every row carries its correct
-- balance at that point in time, so paginated pages are always accurate.
create or replace view public.v_sap_history as
select
  d.id,
  d.material_code,
  d.material_description,
  d.item,
  d.storage_location,
  d.movement_type,
  d.special_stock,
  d.material_document,
  d.material_doc_item,
  d.posting_date,
  d.quantity,
  d.unit_of_entry,
  d.purchase_order,
  d.user_name,
  d.invoice_number,
  d.vendor,
  d.document_header_text,
  d.imported_at,
  sum(d.quantity) over (
    partition by d.material_code, d.storage_location
    order by d.posting_date nulls last, d.id
    rows between unbounded preceding and current row
  ) as running_balance
from public.sap_material_documents d
where d.user_id = auth.uid();

grant select on public.v_sap_stock to authenticated, anon;
grant select on public.v_sap_history to authenticated, anon;

commit;
