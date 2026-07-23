-- Hogar único, inventario por lotes y comandos idempotentes.
-- Mantiene user_id como dato de compatibilidad mientras el cliente adopta household_id.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null unique references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create index household_members_household_idx on public.household_members (household_id);

-- Cada perfil existente obtiene un hogar personal antes de añadir la nueva propiedad.
insert into public.households (id, name, owner_user_id)
select gen_random_uuid(), coalesce(nullif(u.display_name, ''), split_part(u.email, '@', 1), 'Mi hogar'), u.id
from public.users u;

insert into public.household_members (household_id, user_id, role)
select h.id, u.id, 'owner'
from public.users u
join public.households h on h.owner_user_id = u.id
where not exists (
  select 1 from public.household_members hm where hm.user_id = u.id
);

alter table public.pantry_items add column household_id uuid references public.households (id) on delete cascade;
alter table public.shopping_list_items add column household_id uuid references public.households (id) on delete cascade;
alter table public.cooked_recipes add column household_id uuid references public.households (id) on delete cascade;

update public.pantry_items p set household_id = hm.household_id
from public.household_members hm where hm.user_id = p.user_id;
update public.shopping_list_items s set household_id = hm.household_id
from public.household_members hm where hm.user_id = s.user_id;
update public.cooked_recipes c set household_id = hm.household_id
from public.household_members hm where hm.user_id = c.user_id;

alter table public.pantry_items alter column household_id set not null;
alter table public.shopping_list_items alter column household_id set not null;
alter table public.cooked_recipes alter column household_id set not null;

create index pantry_items_household_idx on public.pantry_items (household_id);
create index shopping_list_items_household_idx on public.shopping_list_items (household_id);
create index cooked_recipes_household_time_idx on public.cooked_recipes (household_id, cooked_at desc);

-- Crea perfil, hogar y membresía como una única operación al registrarse.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_name text;
begin
  insert into public.users (id, email)
  values (new.id, new.email);

  v_name := coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'Mi hogar');
  insert into public.households (name, owner_user_id) values (v_name, new.id) returning id into v_household;
  insert into public.household_members (household_id, user_id, role)
  values (v_household, new.id, 'owner');
  return new;
end;
$$;

create function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id and hm.user_id = (select auth.uid())
  );
$$;

create function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select hm.household_id from public.household_members hm where hm.user_id = (select auth.uid());
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy "households_select_member" on public.households
  for select to authenticated using (public.is_household_member(id));
create policy "members_select_own" on public.household_members
  for select to authenticated using (user_id = (select auth.uid()));

drop policy "pantry_all_own" on public.pantry_items;
create policy "pantry_all_household" on public.pantry_items
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy "shopping_all_own" on public.shopping_list_items;
create policy "shopping_all_household" on public.shopping_list_items
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy "cooked_select_own" on public.cooked_recipes;
create policy "cooked_select_household" on public.cooked_recipes
  for select to authenticated using (public.is_household_member(household_id));

grant select on public.households, public.household_members to authenticated;
grant execute on function public.is_household_member(uuid), public.current_household_id() to authenticated;
grant select, insert, update, delete on public.households, public.household_members to service_role;

create table public.inventory_commands (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  idempotency_key uuid not null,
  kind text not null check (kind in ('purchase', 'adjustment', 'cook', 'restore')),
  actor_user_id uuid not null references public.users (id) on delete restrict,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (household_id, idempotency_key)
);

create table public.pantry_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  name text not null,
  category text,
  unit text,
  initial_quantity numeric,
  remaining_quantity numeric,
  source text not null check (source in ('purchase', 'manual', 'migration', 'restore')),
  confidence text not null default 'confirmed' check (confidence in ('confirmed', 'estimated')),
  purchased_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  check (initial_quantity is null or initial_quantity >= 0),
  check (remaining_quantity is null or remaining_quantity >= 0)
);

create index pantry_batches_household_fefo_idx
  on public.pantry_batches (household_id, ingredient_id, unit, purchased_at, created_at);

create table public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  command_id uuid references public.inventory_commands (id) on delete restrict,
  batch_id uuid references public.pantry_batches (id) on delete restrict,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  event_type text not null check (event_type in ('purchase', 'consume', 'adjustment', 'waste', 'restore')),
  quantity_delta numeric,
  unit text,
  source text not null check (source in ('shopping_list', 'recipe', 'manual', 'migration', 'system')),
  actor_user_id uuid references public.users (id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index inventory_events_household_time_idx on public.inventory_events (household_id, occurred_at desc);

-- El estado previo se conserva como lote y evento de apertura para auditoría/reconstrucción.
insert into public.pantry_batches (
  household_id, ingredient_id, name, category, unit, initial_quantity, remaining_quantity, source, purchased_at
)
select household_id, ingredient_id, name, category, unit, quantity, quantity, 'migration', updated_at
from public.pantry_items;

insert into public.inventory_events (
  household_id, batch_id, ingredient_id, event_type, quantity_delta, unit, source, actor_user_id, occurred_at
)
select b.household_id, b.id, b.ingredient_id, 'adjustment', b.initial_quantity, b.unit, 'migration', null, b.created_at
from public.pantry_batches b where b.source = 'migration';

alter table public.inventory_commands enable row level security;
alter table public.pantry_batches enable row level security;
alter table public.inventory_events enable row level security;

create policy "commands_select_household" on public.inventory_commands
  for select to authenticated using (public.is_household_member(household_id));
create policy "batches_select_household" on public.pantry_batches
  for select to authenticated using (public.is_household_member(household_id));
create policy "events_select_household" on public.inventory_events
  for select to authenticated using (public.is_household_member(household_id));

grant select on public.inventory_commands, public.pantry_batches, public.inventory_events to authenticated;
grant select, insert, update, delete on public.inventory_commands, public.pantry_batches, public.inventory_events to service_role;
