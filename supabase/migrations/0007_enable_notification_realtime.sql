-- Turn on Realtime replication for the two tables the desktop notification
-- bell listens to.
--
-- `useInventoryNotifications` (src/hooks/useInventoryNotifications.ts)
-- subscribes to `postgres_changes` INSERT events on `inventory_transactions`
-- and `receipt_header` so the bell rings for every stock movement (Opening
-- Stock, Adjustment, Allocation, Material Receipt, Material Issue, Location
-- Transfer) and every DRC creation. That subscription only ever receives
-- events for tables that are part of the `supabase_realtime` publication -
-- adding a `.on("postgres_changes", ...)` listener in the client does NOT
-- turn replication on by itself. Neither table was ever added to the
-- publication (there is no earlier migration or dashboard toggle for it
-- checked into this repo), so every insert into these tables happens
-- exactly as before but is never broadcast - the bell silently never rings,
-- with no error anywhere, since `recordInventoryTransaction` treats logging
-- failures as best-effort and swallows them (see inventoryTransactionService.ts).
--
-- Safe to run any number of times: each block is a no-op if the table is
-- already published.

begin;

do $$
begin
  if to_regclass('public.inventory_transactions') is not null
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'inventory_transactions'
     )
  then
    alter publication supabase_realtime add table public.inventory_transactions;
  end if;

  if to_regclass('public.receipt_header') is not null
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'receipt_header'
     )
  then
    alter publication supabase_realtime add table public.receipt_header;
  end if;
end $$;

commit;
