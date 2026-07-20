-- Perfil automático + Row Level Security.

-- El perfil (public.users) se identifica con el id del usuario de auth.
alter table users alter column id drop default;
alter table users
  add constraint users_id_fkey foreign key (id) references auth.users (id) on delete cascade;

-- Crea el perfil al registrarse un usuario nuevo.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Activar RLS en todas las tablas de datos.
alter table users enable row level security;
alter table pantry_items enable row level security;
alter table shopping_list_items enable row level security;
alter table subscriptions enable row level security;
alter table recipes enable row level security;

-- Perfil: cada usuario ve y edita el suyo (la inserción la hace el trigger).
create policy "users_select_own" on users
  for select to authenticated using (id = (select auth.uid()));
create policy "users_update_own" on users
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Alacena: CRUD del propio usuario.
create policy "pantry_all_own" on pantry_items
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Lista de la compra: CRUD del propio usuario.
create policy "shopping_all_own" on shopping_list_items
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Suscripción: cada usuario ve la suya (las escrituras van por service_role/webhook).
create policy "subscriptions_select_own" on subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- Recetas: lectura compartida entre usuarios autenticados (escritura solo service_role).
create policy "recipes_select_authenticated" on recipes
  for select to authenticated using (true);

-- Privilegios de tabla (RLS filtra filas; el GRANT concede el acceso base).
-- Necesario porque Supabase ya no auto-expone tablas nuevas a los roles del Data API.
grant select, update on users to authenticated;
grant select, insert, update, delete on pantry_items to authenticated;
grant select, insert, update, delete on shopping_list_items to authenticated;
grant select on subscriptions to authenticated;
grant select on recipes to authenticated;

-- El backend (Edge Functions con service_role) gestiona recetas y suscripciones.
grant select, insert, update, delete
  on users, pantry_items, shopping_list_items, subscriptions, recipes
  to service_role;
