-- Sugeridas de la Home. Cambios frente a 0018:
--  * p_meal_type (franja) y p_exclude (ya-vistas, para rotación con pull-to-refresh).
--  * Filtra por preferencias (alérgenos/dieta) de user_preferences. El mapa
--    necesidad->alérgeno y preferencia->dieta REPLICA supabase/functions/_shared/preferences.ts;
--    si cambia allí, actualízalo aquí.
--  * Pasada A "casi completo": recetas a las que faltan <=2 ingredientes NO-staple de la
--    despensa (staples = especias/condimentos/aceites-vinagres-salsas, se asumen en casa).
--  * Pasada B (fallback): si A no llena el cupo, completa por preferencias ignorando la despensa.
--  * La franja (p_meal_type) NO es filtro duro: ordena primero (slot_match desc) en ambas
--    pasadas, así manda pero nunca vacía el feed si la franja tiene pocas recetas.
--  * Mantiene el dedup por variedad (similitud coseno > 0,9).
drop function if exists recommended_recipes(int);
drop function if exists recommended_recipes(int, text, uuid[]);
create function recommended_recipes(
  p_limit int default 6,
  p_meal_type text default null,
  p_exclude uuid[] default '{}'
)
returns table (
  id uuid,
  title text,
  description text,
  image_url text,
  prep_time_min int,
  cook_time_min int,
  tags text[],
  match_count int,
  missing_count int
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_exclude_allergens text[];
  v_require_diet text[];
  v_picked uuid[] := '{}';
  picked vector(768)[] := array[]::vector(768)[];
  e vector(768);
  n int := 0;
  too_similar boolean;
  r record;
begin
  -- Preferencias -> claves de alérgeno (mapa espejo de _shared/preferences.ts).
  select coalesce(array_agg(distinct m.allergen), '{}')
    into v_exclude_allergens
  from user_preferences up
  cross join lateral unnest(up.special_needs) as sn
  join (values
    ('Frutos secos','nuts'), ('Cacahuete','peanut'),
    ('Marisco','crustaceans'), ('Marisco','molluscs'),
    ('Pescado','fish'), ('Huevo','egg'), ('Leche','milk'), ('Soja','soy'),
    ('Sésamo','sesame'), ('Mostaza','mustard'), ('Apio','celery'), ('Lactosa','milk'),
    ('Gluten / celiaquía','gluten'), ('Fructosa','fructose'), ('Histamina','histamine'),
    ('Sorbitol','sorbitol'), ('Sin cerdo','pork'), ('Sin alcohol','alcohol'),
    ('Halal','pork'), ('Halal','alcohol'),
    ('Kosher','pork'), ('Kosher','crustaceans'), ('Kosher','molluscs')
  ) as m(need, allergen) on m.need = sn
  where up.user_id = v_uid;

  -- Preferencias -> dieta requerida (mapa espejo de _shared/preferences.ts).
  select coalesce(array_agg(distinct d.diet), '{}')
    into v_require_diet
  from user_preferences up
  cross join lateral unnest(up.food_prefs) as fp
  join (values
    ('Vegana','vegan'), ('Vegana','vegetarian'), ('Vegetariana','vegetarian')
  ) as d(pref, diet) on d.pref = fp
  where up.user_id = v_uid;

  v_exclude_allergens := coalesce(v_exclude_allergens, '{}');
  v_require_diet := coalesce(v_require_diet, '{}');

  -- Pasada A: por despensa (casi completo, faltan <=2 no-staple).
  for r in
    with pantry as (
      select ingredient_id from pantry_items
      where user_id = v_uid and ingredient_id is not null
    ),
    staple as (
      -- ingredients.id cualificado: `id` es OUT param de la función y colisiona con la columna.
      select ingredients.id from ingredients
      where category in ('Especias y hierbas', 'Condimentos y edulcorantes', 'Aceites, vinagres y salsas')
    ),
    scored as (
      select rec.id, rec.title, rec.description, rec.image_url, rec.prep_time_min,
             rec.cook_time_min, rec.tags, rec.embedding, rec.created_at,
             (p_meal_type is not null and rec.meal_types @> array[p_meal_type]) as slot_match,
             count(distinct x.iid) filter (where pantry.ingredient_id is not null)::int as mc,
             count(distinct x.iid) filter (where pantry.ingredient_id is null and staple.id is null)::int as missing
      from recipes rec
      join lateral jsonb_array_elements(rec.ingredients) ing on true
      cross join lateral (select (ing->>'ingredient_id')::uuid as iid) x
      left join pantry on pantry.ingredient_id = x.iid
      left join staple on staple.id = x.iid
      where x.iid is not null
        and rec.reusable
        and (cardinality(v_exclude_allergens) = 0
             or (rec.allergens is not null and not (rec.allergens && v_exclude_allergens)))
        and (cardinality(v_require_diet) = 0
             or (rec.diet is not null and rec.diet @> v_require_diet))
        and rec.id <> all(p_exclude)
      group by rec.id
    )
    select * from scored
    where missing <= 2 and mc >= 1
    order by slot_match desc, missing asc, mc desc, created_at desc
  loop
    exit when n >= p_limit;
    too_similar := false;
    if r.embedding is not null then
      foreach e in array picked loop
        if 1 - (r.embedding <=> e) > 0.9 then too_similar := true; exit; end if;
      end loop;
    end if;
    if too_similar then continue; end if;
    if r.embedding is not null then picked := picked || r.embedding; end if;
    id := r.id; title := r.title; description := r.description; image_url := r.image_url;
    prep_time_min := r.prep_time_min; cook_time_min := r.cook_time_min; tags := r.tags;
    match_count := r.mc; missing_count := r.missing;
    v_picked := v_picked || r.id;
    n := n + 1;
    return next;
  end loop;

  -- Pasada B: fallback por preferencias+franja (ignora la despensa).
  if n < p_limit then
    for r in
      with pantry as (
        select ingredient_id from pantry_items
        where user_id = v_uid and ingredient_id is not null
      ),
      staple as (
        -- ingredients.id cualificado: `id` es OUT param de la función y colisiona con la columna.
        select ingredients.id from ingredients
        where category in ('Especias y hierbas', 'Condimentos y edulcorantes', 'Aceites, vinagres y salsas')
      ),
      scored as (
        select rec.id, rec.title, rec.description, rec.image_url, rec.prep_time_min,
               rec.cook_time_min, rec.tags, rec.embedding, rec.created_at,
               (p_meal_type is not null and rec.meal_types @> array[p_meal_type]) as slot_match,
               count(distinct x.iid) filter (where pantry.ingredient_id is not null)::int as mc,
               count(distinct x.iid) filter (where pantry.ingredient_id is null and staple.id is null)::int as missing
        from recipes rec
        join lateral jsonb_array_elements(rec.ingredients) ing on true
        cross join lateral (select (ing->>'ingredient_id')::uuid as iid) x
        left join pantry on pantry.ingredient_id = x.iid
        left join staple on staple.id = x.iid
        where rec.reusable
          and (cardinality(v_exclude_allergens) = 0
               or (rec.allergens is not null and not (rec.allergens && v_exclude_allergens)))
          and (cardinality(v_require_diet) = 0
               or (rec.diet is not null and rec.diet @> v_require_diet))
          and rec.id <> all(p_exclude)
          and rec.id <> all(v_picked)
        group by rec.id
      )
      select * from scored
      order by slot_match desc, created_at desc
    loop
      exit when n >= p_limit;
      too_similar := false;
      if r.embedding is not null then
        foreach e in array picked loop
          if 1 - (r.embedding <=> e) > 0.9 then too_similar := true; exit; end if;
        end loop;
      end if;
      if too_similar then continue; end if;
      if r.embedding is not null then picked := picked || r.embedding; end if;
      id := r.id; title := r.title; description := r.description; image_url := r.image_url;
      prep_time_min := r.prep_time_min; cook_time_min := r.cook_time_min; tags := r.tags;
      match_count := r.mc; missing_count := r.missing;
      n := n + 1;
      return next;
    end loop;
  end if;
end;
$$;

grant execute on function recommended_recipes(int, text, uuid[]) to authenticated;
