begin;

create table public.item_stock (
  label_id uuid primary key references public.item_labels(id),
  quantity integer not null default 0 check (quantity >= 0)
);
create table public.item_return_events (
  request_id uuid primary key,
  label_id uuid not null references public.item_labels(id),
  quantity_after integer check (quantity_after >= 0),
  returned_at timestamptz not null default now()
);
create index item_return_events_label_id_idx on public.item_return_events(label_id);
alter table public.item_stock enable row level security;
alter table public.item_return_events enable row level security;
revoke all on public.item_stock, public.item_return_events from public, anon, authenticated;
grant select, insert, update on public.item_stock, public.item_return_events to service_role;

-- No real stock count existed: initialize categories at zero without inventing inventory.
insert into public.item_stock(label_id) select id from public.item_labels where is_active;

create function public.confirm_item_return(p_request_id uuid, p_label_id uuid)
returns table(request_id uuid, label_id uuid, name text, quantity integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  inserted_id uuid;
  existing_label uuid;
  next_quantity integer;
begin
  perform 1 from public.item_labels l where l.id = p_label_id and l.is_active;
  if not found then
    raise exception 'Unknown or inactive item label' using errcode = '22023';
  end if;
  insert into public.item_return_events(request_id, label_id)
  values(p_request_id, p_label_id)
  on conflict on constraint item_return_events_pkey do nothing
  returning item_return_events.request_id into inserted_id;
  if inserted_id is not null then
    insert into public.item_stock as stock(label_id, quantity) values(p_label_id, 1)
    on conflict on constraint item_stock_pkey
    do update set quantity = stock.quantity + 1
    returning stock.quantity into next_quantity;
    update public.item_return_events e set quantity_after = next_quantity where e.request_id = p_request_id;
  else
    select e.label_id into existing_label from public.item_return_events e where e.request_id = p_request_id;
    if existing_label is distinct from p_label_id then
      raise exception 'Return request already belongs to another item' using errcode = '22023';
    end if;
  end if;
  return query select e.request_id, e.label_id, l.name, e.quantity_after
    from public.item_return_events e join public.item_labels l on l.id = e.label_id
    where e.request_id = p_request_id;
end;
$$;
revoke all on function public.confirm_item_return(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_item_return(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
