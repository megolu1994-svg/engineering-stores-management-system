-- Block material codes in Material Master.
--
-- A blocked material must not participate in ANY further activity:
--   - inventory transactions (receipt/GRN, issue, transfer, allocation,
--     adjustment, opening stock)
--   - stock updates (material_allocation / pending_stock_updates)
--   - SAP stock snapshots (sap_stock_distribution / v_sap_stock)
--   - SAP history imports (sap_material_documents)
--   - SAP reconciliation reviews (stock_reconciliation_reviews)
--
-- The app already refuses blocked materials with a friendly message
-- (assertMaterialNotBlocked / bulk-import skips). This trigger is the
-- second, database-level line of defence: even a direct insert/update to
-- any of the tables below is rejected when the referenced material is
-- blocked, so no code path - frontend, API, or manual SQL - can move
-- stock or SAP data for a blocked material.
--
-- Idempotent: safe to run more than once.

begin;

-- 1. Blocked flag + audit columns on material_master.
alter table public.material_master
  add column if not exists is_blocked boolean not null default false,
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_reason text;

create index if not exists material_master_is_blocked_idx
  on public.material_master (is_blocked) where is_blocked = true;

-- 2. Shared guard function. Works on any table that carries both
--    material_code and user_id (all the tables below do). NEW.user_id is
--    set by the existing column default (auth.uid()), and falls back to
--    auth.uid() for safety. If the material is blocked, the write is
--    rejected with a clear message.
create or replace function public.enforce_material_not_blocked()
returns trigger
language plpgsql
as $$
declare
  is_blocked_flag boolean;
begin
  if NEW.material_code is null or NEW.material_code = '' then
    return NEW;
  end if;

  select m.is_blocked
    into is_blocked_flag
    from public.material_master m
   where m.material_code = NEW.material_code
     and m.user_id = coalesce(NEW.user_id, auth.uid());

  if coalesce(is_blocked_flag, false) then
    raise exception 'Material % is blocked. No transactions, stock updates, or SAP updates are allowed for blocked materials.',
      NEW.material_code;
  end if;

  return NEW;
end;
$$;

-- 3. Attach the guard to every table that records stock, transactions,
--    pending stock updates, SAP history, SAP stock or SAP reviews.
drop trigger if exists trg_blocked_material_guard on public.material_allocation;
create trigger trg_blocked_material_guard
  before insert or update on public.material_allocation
  for each row execute function public.enforce_material_not_blocked();

drop trigger if exists trg_blocked_material_guard on public.inventory_transactions;
create trigger trg_blocked_material_guard
  before insert on public.inventory_transactions
  for each row execute function public.enforce_material_not_blocked();

drop trigger if exists trg_blocked_material_guard on public.pending_stock_updates;
create trigger trg_blocked_material_guard
  before insert or update on public.pending_stock_updates
  for each row execute function public.enforce_material_not_blocked();

drop trigger if exists trg_blocked_material_guard on public.sap_material_documents;
create trigger trg_blocked_material_guard
  before insert or update on public.sap_material_documents
  for each row execute function public.enforce_material_not_blocked();

drop trigger if exists trg_blocked_material_guard on public.sap_stock_distribution;
create trigger trg_blocked_material_guard
  before insert or update on public.sap_stock_distribution
  for each row execute function public.enforce_material_not_blocked();

-- For reviews, only SAP-data changes are guarded: flipping status to
-- applied/dismissed (a workflow action, not an SAP/stock write) must stay
-- possible even for a blocked material.
drop trigger if exists trg_blocked_material_guard on public.stock_reconciliation_reviews;
create trigger trg_blocked_material_guard
  before insert or update of material_code, sap_total, app_total, difference, sloc_breakdown
  on public.stock_reconciliation_reviews
  for each row execute function public.enforce_material_not_blocked();

drop trigger if exists trg_blocked_material_guard on public.issue_items;
create trigger trg_blocked_material_guard
  before insert or update on public.issue_items
  for each row execute function public.enforce_material_not_blocked();

drop trigger if exists trg_blocked_material_guard on public.transfer_items;
create trigger trg_blocked_material_guard
  before insert or update on public.transfer_items
  for each row execute function public.enforce_material_not_blocked();

drop trigger if exists trg_blocked_material_guard on public.receipt_grn_lines;
create trigger trg_blocked_material_guard
  before insert or update on public.receipt_grn_lines
  for each row execute function public.enforce_material_not_blocked();

-- NOTE: receipt_inspection_history is DRC-level (no material_code column)
-- and is deliberately not guarded - inspection records a workflow step,
-- not a material transaction.

commit;