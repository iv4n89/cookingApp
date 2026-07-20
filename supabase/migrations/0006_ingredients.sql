-- Catálogo controlado de ingredientes (clasificado; imágenes IA en un slice posterior).
create extension if not exists unaccent;

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Nombre en minúsculas y sin acentos, para dedupe y búsqueda insensible a tildes.
  normalized_name text not null unique,
  category text not null,
  image_url text,
  created_at timestamptz not null default now()
);
create index ingredients_category_idx on ingredients (category);
create index ingredients_normalized_idx on ingredients (normalized_name);

-- Catálogo compartido: lectura para autenticados, escritura solo para el backend.
alter table ingredients enable row level security;
create policy "ingredients_select_authenticated" on ingredients
  for select to authenticated using (true);
grant select on ingredients to authenticated;
grant select, insert, update on ingredients to service_role;
