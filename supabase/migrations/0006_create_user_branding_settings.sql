-- Per-account header branding (Company Name, Warehouse Name, Logo Letter).
--
-- The purple header currently hardcodes "DUMAD STORE" and a "D" logo for
-- every account. This adds a one-row-per-account settings table so each
-- signup can set its own Company Name (shown centered at the top of the
-- header), Warehouse Name and Logo Letter (shown where "DUMAD STORE" / "D"
-- used to be). A brand-new account has no row here, so the app reads it as
-- all blank and renders a clean purple header with no text/logo until the
-- account fills in Settings.

begin;

create table if not exists public.user_branding_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null default '',
  warehouse_name text not null default '',
  logo_letter text not null default '' check (char_length(logo_letter) <= 2),
  updated_at timestamptz not null default now()
);

alter table public.user_branding_settings enable row level security;

drop policy if exists tenant_isolation on public.user_branding_settings;

create policy tenant_isolation on public.user_branding_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

commit;
