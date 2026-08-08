-- Add SAP-aligned Storage Location as an ownership/accounting dimension,
-- while keeping location_code as the physical warehouse Bin Location.
create table if not exists public.storage_location_master (
  storage_location_code text primary key,
  storage_location_description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.storage_location_master (storage_location_code, storage_location_description)
values
  ('UNSPECIFIED', 'Unspecified Storage Location'),
  ('AFCN', 'AF Common Store'),
  ('REVN', 'Revenue Store'),
  ('ESRN', 'Engineering Service Revenue Store')
on conflict (storage_location_code) do nothing;

alter table public.material_allocation
  add column if not exists storage_location_code text not null default 'UNSPECIFIED';

alter table public.inventory_transactions
  add column if not exists storage_location_code text not null default 'UNSPECIFIED';

alter table public.pending_stock_updates
  add column if not exists storage_location_code text not null default 'UNSPECIFIED';

create index if not exists material_allocation_storage_location_idx
  on public.material_allocation (storage_location_code);

create index if not exists pending_stock_updates_storage_location_idx
  on public.pending_stock_updates (storage_location_code);

-- Keep one pending reconciliation row per material/storage-location bucket.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'pending_stock_updates_user_material_key'
  ) then
    alter table public.pending_stock_updates
      drop constraint pending_stock_updates_user_material_key;
  end if;
exception when others then
  null;
end $$;

create unique index if not exists pending_stock_updates_user_material_storage_key
  on public.pending_stock_updates (user_id, material_code, storage_location_code)
  where user_id is not null;

create unique index if not exists pending_stock_updates_material_storage_key
  on public.pending_stock_updates (material_code, storage_location_code)
  where user_id is null;

create index if not exists inventory_transactions_storage_location_idx
  on public.inventory_transactions (storage_location_code);

-- Move uniqueness to material + Storage Location + Bin Location where possible.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'material_allocation_user_key'
  ) then
    alter table public.material_allocation
      drop constraint material_allocation_user_key;
  end if;
exception when others then
  null;
end $$;

create unique index if not exists material_allocation_storage_bin_user_key
  on public.material_allocation (user_id, material_code, storage_location_code, location_code)
  where user_id is not null;

create unique index if not exists material_allocation_storage_bin_key
  on public.material_allocation (material_code, storage_location_code, location_code)
  where user_id is null;

alter table public.issue_item_locations
  add column if not exists storage_location_code text not null default 'UNSPECIFIED';

alter table public.transfer_item_locations
  add column if not exists storage_location_code text not null default 'UNSPECIFIED';
