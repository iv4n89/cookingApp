-- Búsqueda semántica de recetas con embeddings de Gemini (768 dims, normalizados).

-- Ajustar la dimensión del embedding a la de gemini-embedding-001 (768).
-- La tabla está vacía, así que el cambio de tipo es directo.
drop index if exists recipes_embedding_idx;
alter table recipes alter column embedding type vector(768);
create index recipes_embedding_idx on recipes
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Vecinos más cercanos por similitud coseno. Devuelve la receta sin el embedding.
create function match_recipes(
  query_embedding vector(768),
  match_threshold float,
  match_count int
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
  order by r.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function match_recipes(vector, float, int) to service_role, authenticated;
