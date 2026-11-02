-- Add PDF template column to invoices (run in Supabase SQL Editor)
alter table public.invoices
  add column if not exists template text default 'modern';

-- Optional: backfill existing rows
update public.invoices
set template = 'modern'
where template is null;
