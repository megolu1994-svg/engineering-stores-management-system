-- Adds the material counting check to GRN processing. Before a GRN is
-- submitted for a DRC, the operator confirms the received material was
-- physically counted/verified; if a discrepancy turns up during that
-- count, the remarks describing it are captured alongside the GRN record
-- so the AI-assisted supplier mail (drafted client-side, never sent by the
-- app) has something concrete to reference.
alter table public.receipt_grn
  add column if not exists counting_checked boolean not null default false;

alter table public.receipt_grn
  add column if not exists discrepancy_found boolean not null default false;

alter table public.receipt_grn
  add column if not exists discrepancy_remarks text;
