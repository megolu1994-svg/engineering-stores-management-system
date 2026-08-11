-- Cleanup of the previous SAP import design (0009 v1).
--
-- The first version of migration 0009 (and the accompanying importer)
-- put SAP history INTO the app's physical ledger: it added SAP source
-- columns to inventory_transactions, wrote every movement as
-- transaction_type 'SAP_IMPORT', and tagged SAP storage locations into
-- location_master with a location_type flag.
--
-- That design was rejected: SAP storage locations are accounting buckets
-- per material, not physical bins, and the app ledger must stay
-- app-only. This migration removes every artifact of the old design.
-- It is fully guarded (drop if exists / delete only matching rows), so
-- it is safe to run whether or not the old 0009 was ever applied.
--
-- NOTE: if the old importer was used to import history, those movements
-- existed only as 'SAP_IMPORT' rows in inventory_transactions. They are
-- deleted below; re-import the MB51 file through the new importer so
-- the history lands in sap_material_documents instead.

begin;

-- Remove SAP history rows that were written into the app ledger.
delete from public.inventory_transactions
where transaction_type = 'SAP_IMPORT';

-- Drop the SAP source columns added by the old design.
alter table public.inventory_transactions
  drop column if exists sap_movement_type,
  drop column if exists posting_date,
  drop column if exists material_document,
  drop column if exists material_doc_item,
  drop column if exists purchase_order,
  drop column if exists user_name,
  drop column if exists invoice_number,
  drop column if exists vendor,
  drop column if exists document_header_text,
  drop column if exists unit_of_entry;

-- Drop the indexes the old design created on those columns.
drop index if exists public.inventory_transactions_posting_date_idx;
drop index if exists public.inventory_transactions_material_document_idx;

-- Drop the storage-location type flag the old design added.
alter table public.location_master
  drop column if exists location_type;

commit;
