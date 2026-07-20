-- Relación usuario-receta: favoritos y valoración (0-5 estrellas, null = sin valorar).
create table user_recipes (
  user_id uuid not null references users (id) on delete cascade,
  recipe_id uuid not null references recipes (id) on delete cascade,
  is_favorite boolean not null default false,
  rating int check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
create index user_recipes_favorite_idx on user_recipes (user_id, updated_at desc) where is_favorite;

alter table user_recipes enable row level security;
create policy "user_recipes_all_own" on user_recipes
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on user_recipes to authenticated;
grant select, insert, update, delete on user_recipes to service_role;
