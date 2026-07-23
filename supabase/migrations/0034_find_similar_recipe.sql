-- RPC de deduplicación del catálogo: devuelve la receta reusable más cercana por coseno
-- por encima del umbral (top-1), o nada. La usa index-recipe antes de insertar para no
-- crear near-duplicados. No se reutiliza match_recipes porque esa no filtra por reusable
-- y aplica filtros de alérgenos/dieta.
create function find_similar_recipe(query_embedding vector(768), match_threshold float)
returns table (id uuid, title text, similarity float)
language sql
stable
as $$
  select r.id, r.title, 1 - (r.embedding <=> query_embedding) as similarity
  from recipes r
  where r.reusable
    and r.embedding is not null
    and 1 - (r.embedding <=> query_embedding) >= match_threshold
  order by r.embedding <=> query_embedding
  limit 1;
$$;

grant execute on function find_similar_recipe(vector, float) to service_role;
grant execute on function find_similar_recipe(vector, float) to authenticated;
