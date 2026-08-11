-- Per-account theme customization (Light/Dark mode, primary color, font).
--
-- Mirrors `user_branding_settings` (0006): one row per account, saved from
-- Settings, read by ThemeSettingsContext, applied app-wide through the
-- dynamic MUI theme in src/contexts/AppThemeProvider.tsx. A brand-new
-- account has no row here, so the app reads it as the defaults and renders
-- today's Light / brand purple / Inter look until the account customizes.

begin;

create table if not exists public.user_theme_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'light' check (mode in ('light', 'dark', 'system')),
  primary_color text not null default '#6C2BD9',
  font_family text not null default 'inter',
  updated_at timestamptz not null default now()
);

alter table public.user_theme_settings enable row level security;

drop policy if exists tenant_isolation on public.user_theme_settings;

create policy tenant_isolation on public.user_theme_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

commit;
