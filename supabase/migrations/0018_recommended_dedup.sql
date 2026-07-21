-- Las recomendaciones "Para tu despensa" salían casi idénticas (p.ej. varias ensaladas
-- muy parecidas). Se reescribe como greedy: recorre las recetas por match de despensa y
-- descarta las que sean demasiado parecidas (similitud coseno > 0,9) a una ya elegida,
-- para dar variedad.
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
language plpgsql
stable
security invoker
-- public en el path: el tipo vector y el operador <=> de pgvector viven en public.
set search_path = public
as $$
declare
  r record;
  picked vector(768)[] := array[]::vector(768)[];
  e vector(768);
  n int := 0;
  too_similar boolean;
begin
  for r in
    select rec.id, rec.title, rec.description, rec.image_url, rec.prep_time_min,
           rec.cook_time_min, rec.tags, rec.embedding,
           count(distinct ing->>'ingredient_id')::int as mc
    from public.recipes rec
    join lateral jsonb_array_elements(rec.ingredients) ing on true
    join public.pantry_items p
      on p.ingredient_id = (ing->>'ingredient_id')::uuid
     and p.user_id = (select auth.uid())
    where ing->>'ingredient_id' is not null
      and rec.reusable
    group by rec.id
    order by count(distinct ing->>'ingredient_id') desc, rec.created_at desc
  loop
    exit when n >= p_limit;

    too_similar := false;
    if r.embedding is not null then
      foreach e in array picked loop
        if 1 - (r.embedding <=> e) > 0.9 then
          too_similar := true;
          exit;
        end if;
      end loop;
    end if;
    if too_similar then
      continue;
    end if;

    if r.embedding is not null then
      picked := picked || r.embedding;
    end if;

    id := r.id;
    title := r.title;
    description := r.description;
    image_url := r.image_url;
    prep_time_min := r.prep_time_min;
    cook_time_min := r.cook_time_min;
    tags := r.tags;
    match_count := r.mc;
    n := n + 1;
    return next;
  end loop;
end;
$$;

grant execute on function recommended_recipes(int) to authenticated;
