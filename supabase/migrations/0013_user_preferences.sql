-- Preferencias de comida y necesidades especiales del usuario (personalizan la IA).
-- Se guardan las claves seleccionadas del catálogo (en la app) + notas libres.
create table user_preferences (
  user_id uuid primary key references users (id) on delete cascade,
  food_prefs text[] not null default '{}',
  special_needs text[] not null default '{}',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

alter table user_preferences enable row level security;
create policy "user_preferences_all_own" on user_preferences
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on user_preferences to authenticated;
grant select, insert, update, delete on user_preferences to service_role;
