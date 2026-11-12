-- Proposal for the NEW project. Run in its SQL Editor after creating Supabase.
-- This script has not been applied to a hosted database.
create table if not exists public.item_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  model_label text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint item_labels_nonempty check (length(trim(name)) > 0 and length(trim(model_label)) > 0)
);

alter table public.item_labels enable row level security;
revoke all on public.item_labels from anon, authenticated;
grant select on public.item_labels to service_role;

-- Confirm these are your rental categories before using them.
insert into public.item_labels (name, model_label)
values
  ('계산기', 'Calculator'),
  ('가위', 'Scissors'),
  ('마우스', 'Computer mouse')
on conflict (model_label) do nothing;
