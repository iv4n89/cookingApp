-- Mapa preferencia/necesidad -> clave de alérgeno/dieta como DATOS (fuente única).
-- Antes estaba duplicado en TS (_shared/preferences.ts) y embebido como VALUES en el SQL de
-- recommended_recipes (0028/0032), con riesgo de divergencia silenciosa. Ahora ambos leen de
-- estas tablas: cambiar un mapeo = editar solo el seed de abajo.

create table need_allergen_map (
  need text not null,
  allergen text not null,
  primary key (need, allergen)
);

create table pref_diet_map (
  pref text not null,
  diet text not null,
  primary key (pref, diet)
);

insert into need_allergen_map (need, allergen) values
  ('Frutos secos', 'nuts'),
  ('Cacahuete', 'peanut'),
  ('Marisco', 'crustaceans'),
  ('Marisco', 'molluscs'),
  ('Pescado', 'fish'),
  ('Huevo', 'egg'),
  ('Leche', 'milk'),
  ('Soja', 'soy'),
  ('Sésamo', 'sesame'),
  ('Mostaza', 'mustard'),
  ('Apio', 'celery'),
  ('Lactosa', 'milk'),
  ('Gluten / celiaquía', 'gluten'),
  ('Fructosa', 'fructose'),
  ('Histamina', 'histamine'),
  ('Sorbitol', 'sorbitol'),
  ('Sin cerdo', 'pork'),
  ('Sin alcohol', 'alcohol'),
  ('Halal', 'pork'),
  ('Halal', 'alcohol'),
  ('Kosher', 'pork'),
  ('Kosher', 'crustaceans'),
  ('Kosher', 'molluscs');

insert into pref_diet_map (pref, diet) values
  ('Vegana', 'vegan'),
  ('Vegana', 'vegetarian'),
  ('Vegetariana', 'vegetarian');

-- Referencia compartida: lectura para autenticados y backend.
alter table need_allergen_map enable row level security;
create policy "need_allergen_map_select_authenticated" on need_allergen_map
  for select to authenticated using (true);
grant select on need_allergen_map to authenticated;
grant select on need_allergen_map to service_role;

alter table pref_diet_map enable row level security;
create policy "pref_diet_map_select_authenticated" on pref_diet_map
  for select to authenticated using (true);
grant select on pref_diet_map to authenticated;
grant select on pref_diet_map to service_role;

-- Reescribe recommended_recipes (0032) para leer el mapa de las tablas en vez de VALUES
-- embebidos. El resto del cuerpo (incluida image_status de 0032) es idéntico.
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
  image_status text,
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
  -- Necesidades del usuario -> claves de alérgeno a excluir (mapa en need_allergen_map).
  select coalesce(array_agg(distinct m.allergen), '{}')
    into v_exclude_allergens
  from user_preferences up
  cross join lateral unnest(up.special_needs) as sn
  join need_allergen_map m on m.need = sn
  where up.user_id = v_uid;

  -- Preferencias del usuario -> dieta requerida (mapa en pref_diet_map).
  select coalesce(array_agg(distinct d.diet), '{}')
    into v_require_diet
  from user_preferences up
  cross join lateral unnest(up.food_prefs) as fp
  join pref_diet_map d on d.pref = fp
  where up.user_id = v_uid;

  v_exclude_allergens := coalesce(v_exclude_allergens, '{}');
  v_require_diet := coalesce(v_require_diet, '{}');

  -- Pantry + buy en una sola pasada. Comparación por canónico.
  for r in
    with pantry as (
      select distinct coalesce(i.canonical_id, i.id) as cid
      from pantry_items p
      join ingredients i on i.id = p.ingredient_id
      where p.user_id = v_uid and p.ingredient_id is not null
    ),
    staple as (
      select distinct coalesce(i.canonical_id, i.id) as cid
      from ingredients i
      where i.category in ('Especias y hierbas', 'Condimentos y edulcorantes', 'Aceites, vinagres y salsas')
    ),
    scored as (
      select rec.id, rec.title, rec.description, rec.image_url, rec.image_status, rec.prep_time_min,
             rec.cook_time_min, rec.tags, rec.embedding, rec.created_at,
             (p_meal_type is not null and rec.meal_types @> array[p_meal_type]) as slot_match,
             count(distinct x.iid) filter (where pantry.cid is not null)::int as mc,
             count(distinct x.iid) filter (where pantry.cid is null and staple.cid is null)::int as missing
      from recipes rec
      join lateral jsonb_array_elements(rec.ingredients) ing on true
      cross join lateral (select (ing->>'ingredient_id')::uuid as raw_iid) x0
      left join ingredients ri on ri.id = x0.raw_iid
      cross join lateral (select coalesce(ri.canonical_id, ri.id) as iid) x
      left join pantry on pantry.cid = x.iid
      left join staple on staple.cid = x.iid
      where x0.raw_iid is not null
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
    image_status := r.image_status;
    prep_time_min := r.prep_time_min; cook_time_min := r.cook_time_min; tags := r.tags;
    match_count := r.mc; missing_count := r.missing; bucket := b;
    v_picked := v_picked || r.id;
    if b = 'pantry' then n_main := n_main + 1; else n_buy := n_buy + 1; end if;
    return next;
  end loop;

  -- Idea: solo si la despensa no dio nada para la sección principal.
  if n_main = 0 then
    for r in
      select rec.id, rec.title, rec.description, rec.image_url, rec.image_status, rec.prep_time_min,
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
      image_status := r.image_status;
      prep_time_min := r.prep_time_min; cook_time_min := r.cook_time_min; tags := r.tags;
      match_count := 0; missing_count := 0; bucket := 'idea';
      n_main := n_main + 1;
      return next;
    end loop;
  end if;
end;
$$;

grant execute on function recommended_recipes(int, int, text, uuid[]) to authenticated;
