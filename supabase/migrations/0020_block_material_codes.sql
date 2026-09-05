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
-- Idempotent AND schema-tolerant: every trigger is attached only if its
-- table exists (to_regclass check), so databases that were set up before
-- a feature table existed (e.g. transfer_items) do not fail - the
-- missing tables are simply reported via NOTICE and skipped. Safe to run
-- more than once; run it again after creating any missing table.

begin;

-- 1. Blocked flag + audit columns on material_master.
alter table public.material_master
  add column if not exists is_blocked boolean not null default false,
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_reason text;

create index if not exists material_master_is_blocked_idx
  on public.material_master (is_blocked) where is_blocked = true;

-- 2. Shared guard function. Works on any table that carries both
--    material_code and user_id. NEW.user_id is set by the existing
--    column default (auth.uid()), and falls back to auth.uid() for
--    safety. If the material is blocked, the write is rejected with a
--    clear message.
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
--    pending stock updates, SAP history, SAP stock or SAP reviews. Only
--    tables that actually exist get a trigger; anything missing is
--    reported as a NOTICE so you can see exactly what was skipped.
do $$
declare
  _table text;
begin
  foreach _table in array array[
    'material_allocation',
    'inventory_transactions',
    'pending_stock_updates',
    'sap_material_documents',
    'sap_stock_distribution',
    'stock_reconciliation_reviews',
    'issue_items',
    'transfer_items',
    'receipt_grn_lines'
  ] loop
    if to_regclass('public.' || _table) is null then
      raise notice 'Skipped: table public.% does not exist (no block guard attached).', _table;
      continue;
    end if;

    if _table = 'stock_reconciliation_reviews' then
      -- Reviews: guard SAP-data columns only, so flipping status to
      -- applied/dismissed (a workflow action, not an SAP/stock write)
      -- stays possible even for a blocked material.
      execute format(
        'drop trigger if exists trg_blocked_material_guard on public.%I', _table
      );
      execute format(
        'create trigger trg_blocked_material_guard before insert or update of material_code, sap_total, app_total, difference, sloc_breakdown on public.%I for each row execute function public.enforce_material_not_blocked()',
        _table
      );
    elsif _table = 'inventory_transactions' then
      -- Append-only ledger: guard inserts only.
      execute format(
        'drop trigger if exists trg_blocked_material_guard on public.%I', _table
      );
      execute format(
        'create trigger trg_blocked_material_guard before insert on public.%I for each row execute function public.enforce_material_not_blocked()',
        _table
      );
    else
      execute format(
        'drop trigger if exists trg_blocked_material_guard on public.%I', _table
      );
      execute format(
        'create trigger trg_blocked_material_guard before insert or update on public.%I for each row execute function public.enforce_material_not_blocked()',
        _table
      );
    end if;

    raise notice 'Block guard attached to public.%', _table;
  end loop;
end $$;

-- NOTE: receipt_inspection_history is DRC-level (no material_code column)
-- and is deliberately not guarded - inspection records a workflow step,
-- not a material transaction.

commit;