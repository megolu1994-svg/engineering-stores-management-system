-- Hide blocked materials from the SAP Stock and SAP History screens.
--
-- v_sap_stock and v_sap_history are recreated so that any material whose
-- material_master.is_blocked is true is excluded from the aggregation,
-- pagination counts, search and filter dropdowns. Combined with the
-- app-side filters added alongside this migration, a blocked material
-- code disappears from every operational screen while remaining visible
-- in Material Master (where it can be unblocked).
--
-- NOTE: the blocked lookup joins material_master on material_code only,
-- exactly like the existing short_description/uom join and the original
-- views - material_master is treated as the shared master table.
--
-- Idempotent: create or replace view, safe to run more than once.

begin;

-- v_sap_stock: one row per material with an MB52 distribution (or an
-- open reconciliation review), aggregated server-side. Blocked materials
-- are dropped in the `codes` CTE so they never appear, never inflate the
-- count, and never show up in search results.
create or replace view public.v_sap_stock as
with blocked as (
  select material_code
  from public.material_master
  where is_blocked = true
),
codes as (
  select material_code
  from public.sap_stock_distribution
  where user_id = auth.uid()
    and material_code not in (select material_code from blocked)
  union
  select material_code
  from public.stock_reconciliation_reviews
  where status = 'open' and user_id = auth.uid()
    and material_code not in (select material_code from blocked)
),
dist as (
  select material_code, storage_location, min(quantity) as quantity
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

-- v_sap_history: MB51 movements with the per-SLoc running balance.
-- Blocked materials' rows are excluded so their history never appears.
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
where d.user_id = auth.uid()
  and d.material_code not in (
    select material_code
    from public.material_master
    where is_blocked = true
  );

grant select on public.v_sap_stock to authenticated, anon;
grant select on public.v_sap_history to authenticated, anon;

commit;