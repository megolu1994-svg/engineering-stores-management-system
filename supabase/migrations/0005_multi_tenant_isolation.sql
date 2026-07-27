-- Multi-tenant data isolation.
--
-- Today every table in this schema is global: any Supabase Auth user (or
-- literally anyone holding the public anon key) reads and writes the same
-- rows, because no table has RLS enabled and none of them are scoped to a
-- user. This migration makes every account's Material Master, Location
-- Master, and inventory data private to that account: a brand-new signup
-- starts completely empty, and existing data becomes visible only to the
-- account it is assigned to below.
--
-- ============================================================================
-- HOW TO RUN THIS (read before executing)
-- ============================================================================
-- 1. In the app, sign up for your own account (the one that should keep all
--    of today's existing data) using the new Login/Create Account screen.
-- 2. In the Supabase Dashboard, go to Authentication > Users, find that
--    account, and copy its "User UID" (a UUID).
-- 3. Replace every occurrence of 'REPLACE_WITH_YOUR_USER_ID' below with that
--    UUID (keep the quotes).
-- 4. Run this entire file at once (e.g. paste into the Supabase SQL Editor
--    and click Run) so the backfill and the NOT NULL / RLS steps that
--    depend on it happen together - running only part of it will leave
--    tables either without RLS or with rows RLS can't match to anyone.
-- 5. Back up your database first (Database > Backups) since this changes
--    primary keys on material_master and location_master.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Helper: rescopes an existing single/multi-column UNIQUE or PRIMARY KEY
-- constraint on `_table` (matched by its exact column set, e.g.
-- {material_code}) to also include `user_id`, so two different accounts can
-- reuse the same code (e.g. both having a material "MC001") without
-- colliding. If no matching constraint is found, this is a no-op - it never
-- invents a new uniqueness rule the table didn't already have.
-- ----------------------------------------------------------------------------
create or replace function pg_temp.rescope_unique_to_user(
  _table text,
  _cols text[],
  _new_constraint_name text,
  _as_primary_key boolean default false
) returns void
language plpgsql
as $$
declare
  _con record;
  _found boolean := false;
  _sorted_cols text[] := (select array_agg(x order by x) from unnest(_cols) as x);
begin
  for _con in
    select c.conname
    from pg_constraint c
    where c.conrelid = _table::regclass
      and c.contype in ('p', 'u')
      and (
        select array_agg(a.attname order by a.attname)
        from unnest(c.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      ) = _sorted_cols
  loop
    execute format('alter table %s drop constraint %I', _table, _con.conname);
    _found := true;
  end loop;

  if _found then
    if _as_primary_key then
      execute format(
        'alter table %s add constraint %I primary key (user_id, %s)',
        _table, _new_constraint_name, array_to_string(_cols, ', ')
      );
    else
      execute format(
        'alter table %s add constraint %I unique (user_id, %s)',
        _table, _new_constraint_name, array_to_string(_cols, ', ')
      );
    end if;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- STEP 1 - add `user_id` (nullable for now) to every table that stores
-- account-owned data.
-- ----------------------------------------------------------------------------
do $$
declare
  _table text;
  _tables text[] := array[
    'material_master',
    'location_master',
    'material_allocation',
    'inventory_transactions',
    'pending_stock_updates',
    'bulk_import_history',
    'receipt_header',
    'receipt_grn',
    'receipt_grn_lines',
    'receipt_inspection_history',
    'receipt_mail_log',
    'issue_header',
    'issue_items',
    'issue_item_locations',
    'transfer_header',
    'transfer_items',
    'transfer_item_locations',
    'material_photos'
  ];
begin
  foreach _table in array _tables loop
    if to_regclass('public.' || _table) is not null then
      execute format(
        'alter table public.%I add column if not exists user_id uuid references auth.users(id) on delete cascade',
        _table
      );
      execute format(
        'create index if not exists %I on public.%I (user_id)',
        _table || '_user_id_idx', _table
      );
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- STEP 2 - backfill every existing row to your account.
-- ----------------------------------------------------------------------------
do $$
declare
  _table text;
  _owner_id uuid := 'REPLACE_WITH_YOUR_USER_ID';
  _tables text[] := array[
    'material_master',
    'location_master',
    'material_allocation',
    'inventory_transactions',
    'pending_stock_updates',
    'bulk_import_history',
    'receipt_header',
    'receipt_grn',
    'receipt_grn_lines',
    'receipt_inspection_history',
    'receipt_mail_log',
    'issue_header',
    'issue_items',
    'issue_item_locations',
    'transfer_header',
    'transfer_items',
    'transfer_item_locations',
    'material_photos'
  ];
begin
  foreach _table in array _tables loop
    if to_regclass('public.' || _table) is not null then
      execute format(
        'update public.%I set user_id = $1 where user_id is null',
        _table
      ) using _owner_id;
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- STEP 3 - now that every row has an owner, make `user_id` mandatory and
-- default new rows to whoever is signed in.
-- ----------------------------------------------------------------------------
do $$
declare
  _table text;
  _tables text[] := array[
    'material_master',
    'location_master',
    'material_allocation',
    'inventory_transactions',
    'pending_stock_updates',
    'bulk_import_history',
    'receipt_header',
    'receipt_grn',
    'receipt_grn_lines',
    'receipt_inspection_history',
    'receipt_mail_log',
    'issue_header',
    'issue_items',
    'issue_item_locations',
    'transfer_header',
    'transfer_items',
    'transfer_item_locations',
    'material_photos'
  ];
begin
  foreach _table in array _tables loop
    if to_regclass('public.' || _table) is not null then
      execute format('alter table public.%I alter column user_id set default auth.uid()', _table);
      execute format('alter table public.%I alter column user_id set not null', _table);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- STEP 4 - material_code / location_code stop being globally unique and
-- become unique per account, so two different accounts can each have their
-- own "MC001" without clashing.
-- ----------------------------------------------------------------------------
select pg_temp.rescope_unique_to_user('public.material_master', array['material_code'], 'material_master_user_pkey', true);
select pg_temp.rescope_unique_to_user('public.location_master', array['location_code'], 'location_master_user_pkey', true);
select pg_temp.rescope_unique_to_user('public.pending_stock_updates', array['material_code'], 'pending_stock_updates_user_material_key', false);
select pg_temp.rescope_unique_to_user('public.material_allocation', array['material_code', 'location_code'], 'material_allocation_user_key', false);

drop function pg_temp.rescope_unique_to_user(text, text[], text, boolean);

-- ----------------------------------------------------------------------------
-- STEP 5 - enable Row Level Security and add the isolation policy: an
-- account can only ever see/insert/update/delete its own rows. This is
-- enforced by Postgres itself, not by the frontend, so it holds even though
-- the app uses the public anon key.
-- ----------------------------------------------------------------------------
do $$
declare
  _table text;
  _tables text[] := array[
    'material_master',
    'location_master',
    'material_allocation',
    'inventory_transactions',
    'pending_stock_updates',
    'bulk_import_history',
    'receipt_header',
    'receipt_grn',
    'receipt_grn_lines',
    'receipt_inspection_history',
    'receipt_mail_log',
    'issue_header',
    'issue_items',
    'issue_item_locations',
    'transfer_header',
    'transfer_items',
    'transfer_item_locations',
    'material_photos'
  ];
begin
  foreach _table in array _tables loop
    if to_regclass('public.' || _table) is not null then
      execute format('alter table public.%I enable row level security', _table);

      execute format('drop policy if exists tenant_isolation on public.%I', _table);

      execute format(
        'create policy tenant_isolation on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
        _table
      );
    end if;
  end loop;
end $$;

commit;

-- ============================================================================
-- KNOWN LIMITATION - Storage buckets (material-photos, receipt-photos,
-- receipt-files) are NOT covered by this migration. They are currently
-- public buckets with no per-account folder structure, so uploaded photos
-- and documents are not yet isolated between accounts. Isolating them needs
-- a follow-up: prefix upload paths with the uploader's user id and add
-- storage.objects RLS policies (or move to private buckets + signed URLs).
-- ============================================================================
