-- Caché de resolución nombre->ingrediente del pipeline: el resolver IA (withIngredientIds) guarda
-- aquí cada nombre generado por el LLM ya resuelto, para no volver a llamar a Gemini con él.
-- Es catálogo (no datos de usuario). El ingredient_id puede ser canónico o variante; el match
-- por canónico de la RPC/cliente hace el resto.
create table ingredient_aliases (
  normalized_alias text primary key,
  ingredient_id uuid not null references ingredients (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ingredient_aliases_ingredient_idx on ingredient_aliases (ingredient_id);

alter table ingredient_aliases enable row level security;
create policy "ingredient_aliases_select_authenticated" on ingredient_aliases
  for select to authenticated using (true);
grant select on ingredient_aliases to authenticated;
grant select, insert, update, delete on ingredient_aliases to service_role;
