-- Recomendaciones "Para tu despensa": recetas ordenadas por cuántos de sus
-- ingredientes tiene el usuario en la despensa (match por ingredient_id).
-- security invoker: la RLS de pantry_items limita a la despensa del propio usuario.
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
         count(*)::int as match_count
  from public.recipes r
  join lateral jsonb_array_elements(r.ingredients) ing on true
  join public.pantry_items p
    on p.ingredient_id = (ing->>'ingredient_id')::uuid
   and p.user_id = (select auth.uid())
  where ing->>'ingredient_id' is not null
  group by r.id
  order by match_count desc, r.created_at desc
  limit p_limit;
$$;

grant execute on function recommended_recipes(int) to authenticated;
