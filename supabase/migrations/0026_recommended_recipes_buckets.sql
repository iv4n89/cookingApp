-- Sugeridas de la Home en dos secciones (refina 0025):
--  * bucket 'pantry': cocinables ya o a falta de 1 ingrediente no-staple (missing <= 1, mc >= 1).
--    Es la sección principal; se prioriza rellenarla (p_limit).
--  * bucket 'buy': "para comprar algo más" — faltan 2..4 no-staple pero tienes algo (mc >= 1).
--    Sección extra, pequeña (p_extra_limit).
--  * bucket 'idea': solo si no hay NADA en 'pantry' (despensa vacía). Ideas por preferencias+franja
--    ignorando la despensa, para que la sección principal no quede vacía.
-- La franja ordena primero (slot_match) pero no filtra en duro. Mantiene dedup por variedad.
-- El mapa necesidad->alérgeno / preferencia->dieta REPLICA _shared/preferences.ts.
drop function if exists recommended_recipes(int, text, uuid[]);
drop function if exists recommended_recipes(int, int, text, uuid[]);
create function recommended_recipes(
  p_limit int default 6,
  p_extra_limit int default 3,
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
  missing_count int,
  bucket text
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
  n_main int := 0;
  n_buy int := 0;
  b text;
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

  -- Pantry + buy en una sola pasada: recetas con algo en despensa (mc >= 1) a las que faltan
  -- 0..4 no-staple. bucket se decide por missing; cada bucket se corta por su propio límite.
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
    where mc >= 1 and missing <= 4
    -- pantry (missing<=1) antes que buy; dentro, franja y luego menos faltantes.
    order by (missing <= 1) desc, slot_match desc, missing asc, mc desc, created_at desc
  loop
    exit when n_main >= p_limit and n_buy >= p_extra_limit;
    b := case when r.missing <= 1 then 'pantry' else 'buy' end;
    if b = 'pantry' and n_main >= p_limit then continue; end if;
    if b = 'buy' and n_buy >= p_extra_limit then continue; end if;

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
    match_count := r.mc; missing_count := r.missing; bucket := b;
    v_picked := v_picked || r.id;
    if b = 'pantry' then n_main := n_main + 1; else n_buy := n_buy + 1; end if;
    return next;
  end loop;

  -- Idea: solo si la despensa no dio nada para la sección principal.
  if n_main = 0 then
    for r in
      select rec.id, rec.title, rec.description, rec.image_url, rec.prep_time_min,
             rec.cook_time_min, rec.tags, rec.embedding, rec.created_at,
             (p_meal_type is not null and rec.meal_types @> array[p_meal_type]) as slot_match
      from recipes rec
      where rec.reusable
        and (cardinality(v_exclude_allergens) = 0
             or (rec.allergens is not null and not (rec.allergens && v_exclude_allergens)))
        and (cardinality(v_require_diet) = 0
             or (rec.diet is not null and rec.diet @> v_require_diet))
        and rec.id <> all(p_exclude)
        and rec.id <> all(v_picked)
      order by slot_match desc, rec.created_at desc
    loop
      exit when n_main >= p_limit;
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
      match_count := 0; missing_count := 0; bucket := 'idea';
      n_main := n_main + 1;
      return next;
    end loop;
  end if;
end;
$$;

grant execute on function recommended_recipes(int, int, text, uuid[]) to authenticated;
