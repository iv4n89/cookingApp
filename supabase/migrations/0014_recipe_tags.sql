-- Etiquetas estructuradas de la receta para filtrar la caché por preferencias.
-- allergens: alérgenos que CONTIENE. diet: dietas que CUMPLE (vegan, vegetarian).
-- Nullable: null = sin analizar (recetas antiguas) -> se tratan como desconocidas.
alter table recipes add column allergens text[];
alter table recipes add column diet text[];

create index recipes_allergens_idx on recipes using gin (allergens);
create index recipes_diet_idx on recipes using gin (diet);

-- Búsqueda semántica con filtro por necesidades (exclusión dura) y dieta requerida.
-- Cuando hay exclusiones/dieta requerida, las recetas sin analizar (null) quedan fuera (seguridad).
drop function if exists match_recipes(vector, float, int);
create function match_recipes(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  exclude_allergens text[] default '{}',
  require_diet text[] default '{}'
)
returns table (
  id uuid,
  title text,
  description text,
  source text,
  source_url text,
  image_url text,
  servings int,
  prep_time_min int,
  cook_time_min int,
  calories int,
  tags text[],
  ingredients jsonb,
  steps jsonb,
  similarity float
)
language sql
stable
as $$
  select
    r.id, r.title, r.description, r.source, r.source_url, r.image_url,
    r.servings, r.prep_time_min, r.cook_time_min, r.calories, r.tags,
    r.ingredients, r.steps,
    1 - (r.embedding <=> query_embedding) as similarity
  from recipes r
  where r.embedding is not null
    and 1 - (r.embedding <=> query_embedding) >= match_threshold
    and (cardinality(exclude_allergens) = 0
         or (r.allergens is not null and not (r.allergens && exclude_allergens)))
    and (cardinality(require_diet) = 0
         or (r.diet is not null and r.diet @> require_diet))
  order by r.embedding <=> query_embedding
  limit match_count;
$$;
