-- Recetas generadas en el chat llevan modificadores libres de conversación ("sin cebolla",
-- "más picante") que no se capturan como tags filtrables. Marcarlas como no reutilizables
-- para que la búsqueda semántica (Home/search) no se las sirva alteradas a otro usuario.
alter table recipes add column reusable boolean not null default true;

-- Añade el filtro de reutilizables a la búsqueda semántica.
drop function if exists match_recipes(vector, float, int, text[], text[]);
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
    and r.reusable
    and 1 - (r.embedding <=> query_embedding) >= match_threshold
    and (cardinality(exclude_allergens) = 0
         or (r.allergens is not null and not (r.allergens && exclude_allergens)))
    and (cardinality(require_diet) = 0
         or (r.diet is not null and r.diet @> require_diet))
  order by r.embedding <=> query_embedding
  limit match_count;
$$;

-- Las recomendaciones del Home tampoco deben incluir recetas personalizadas de otro usuario.
drop function if exists recommended_recipes(int);
create function recommended_recipes(p_limit int default 6)
returns table (
  id uuid,
  title text,
  description text,
  image_url text,
  prep_time_min int,
  cook_time_min int,
  tags text[],
  match_count int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.title, r.description, r.image_url, r.prep_time_min, r.cook_time_min, r.tags,
         count(distinct ing->>'ingredient_id')::int as match_count
  from public.recipes r
  join lateral jsonb_array_elements(r.ingredients) ing on true
  join public.pantry_items p
    on p.ingredient_id = (ing->>'ingredient_id')::uuid
   and p.user_id = (select auth.uid())
  where ing->>'ingredient_id' is not null
    and r.reusable
  group by r.id
  order by match_count desc, r.created_at desc
  limit p_limit;
$$;

grant execute on function recommended_recipes(int) to authenticated;
