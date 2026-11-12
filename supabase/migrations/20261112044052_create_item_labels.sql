-- Standard rental categories consumed by the read-only model server.
-- UUIDs belong to this database; YOLO class IDs must not be used as row IDs.
create table public.item_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  model_label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint item_labels_model_label_key unique (model_label),
  constraint item_labels_name_nonempty check (length(trim(name)) > 0),
  constraint item_labels_model_label_trimmed check (
    length(model_label) > 0 and model_label = trim(model_label)
  )
);

comment on table public.item_labels is 'Standard item categories matched to YOLO Open Images V7 labels';
comment on column public.item_labels.model_label is 'Exact model output name, e.g. Calculator or Computer mouse';

alter table public.item_labels enable row level security;

-- No public/client access. The model server only needs SELECT.
revoke all on table public.item_labels from public, anon, authenticated, service_role;
grant usage on schema public to service_role;
grant select on table public.item_labels to service_role;
