-- Retirar una receta del catálogo sin borrarla. Borrar no era opción: user_recipes y
-- cooked_recipes tienen clave ajena contra recipes, así que borrar le quita a alguien una receta
-- que había guardado o cocinado. Por eso los 50 títulos duplicados llevaban semanas aplazados.
-- Retirada = retired_at no nulo. Sin columna de estado aparte: sería redundante y permitiría el
-- estado incoherente "publicada con fecha de retirada".

alter table public.recipes
  add column retired_at timestamptz,
  add column retired_reason text;

alter table public.recipes
  add constraint recipes_retired_reason_vocabulary
    check (retired_reason in ('duplicate', 'incoherent', 'bad_image')),
  -- Retirar sin decir por qué no vale: en un mes nadie recordará por qué se fueron 61 recetas.
  add constraint recipes_retired_coherent
    check ((retired_at is null) = (retired_reason is null));

-- Las consultas del catálogo filtran por esto en cada llamada.
create index recipes_published_idx on public.recipes (id) where retired_at is null;

-- Las cuatro funciones que eligen recetas del catálogo pasan a filtrar las retiradas. Se
-- reemplazan copiando su definición vigente y añadiendo una sola línea al where, sin tocar nada
-- más: firmas, cuerpos y permisos quedan como estaban.

create or replace function public.build_household_recommendation_snapshot(
  p_household_id uuid,
  p_requesting_user_id uuid,
  p_evaluated_at timestamptz,
  p_meal_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_evaluation_date date := (p_evaluated_at at time zone 'Europe/Madrid')::date;
  v_season text := public.recommendation_season(v_evaluation_date);
  v_meal_type text := nullif(btrim(p_meal_type), '');
  v_allergens text[] := '{}';
  v_required_diet text[] := '{}';
  v_unsupported text[] := '{}';
  v_notes boolean := false;
  v_safety_version text;
  v_snapshot jsonb;
begin
  if p_household_id is null or p_requesting_user_id is null or p_evaluated_at is null then
    raise exception 'recommendation snapshot requires household, user and evaluation time'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id and hm.user_id = p_requesting_user_id
  ) then
    raise exception 'requesting user is not a household member'
      using errcode = '42501';
  end if;
  if v_meal_type is not null and v_meal_type not in ('desayuno', 'almuerzo', 'merienda', 'cena') then
    raise exception 'unsupported meal type' using errcode = '22023';
  end if;

  select
    coalesce(array_agg(distinct m.allergen order by m.allergen) filter (where m.allergen is not null), '{}'),
    coalesce(bool_or(nullif(btrim(up.notes), '') is not null), false)
  into v_allergens, v_notes
  from public.household_members hm
  join public.user_preferences up on up.user_id = hm.user_id
  left join lateral unnest(up.special_needs) as need(value) on true
  left join public.need_allergen_map m
    on m.need = need.value
   and m.need in (
     'Frutos secos', 'Cacahuete', 'Marisco', 'Pescado', 'Huevo', 'Leche', 'Soja',
     'Sésamo', 'Mostaza', 'Apio', 'Lactosa', 'Gluten / celiaquía', 'Sin cerdo', 'Sin alcohol'
   )
  where hm.household_id = p_household_id;

  select coalesce(array_agg(distinct need.value order by need.value), '{}')
  into v_unsupported
  from public.household_members hm
  join public.user_preferences up on up.user_id = hm.user_id
  cross join lateral unnest(up.special_needs) as need(value)
  left join public.need_allergen_map mapped on mapped.need = need.value
  where hm.household_id = p_household_id
    and (
      need.value not in (
        'Frutos secos', 'Cacahuete', 'Marisco', 'Pescado', 'Huevo', 'Leche', 'Soja',
        'Sésamo', 'Mostaza', 'Apio', 'Lactosa', 'Gluten / celiaquía', 'Sin cerdo', 'Sin alcohol'
      )
      or mapped.need is null
    );

  select coalesce(array_agg(distinct d.diet order by d.diet), '{}')
  into v_required_diet
  from public.user_preferences up
  cross join lateral unnest(up.food_prefs) as pref(value)
  join public.pref_diet_map d on d.pref = pref.value
  where up.user_id = p_requesting_user_id;

  select coalesce(max(dataset_version), 'none')
  into v_safety_version
  from public.ingredient_allergen_profiles;

  select jsonb_build_object(
    'householdId', p_household_id,
    'requestingUserId', p_requesting_user_id,
    'evaluatedAt', p_evaluated_at,
    'evaluationDate', v_evaluation_date,
    'season', v_season,
    'mealType', v_meal_type,
    'rotationSeed', md5(p_household_id::text || (p_evaluated_at at time zone 'Europe/Madrid')::date::text),
    'policyVersion', 'recommendation-es-v1',
    'assumedBasicsVersion', 'assumed-basics-es-v1',
    'ingredientSafetyDatasetVersion', v_safety_version,
    'effectiveAllergens', to_jsonb(coalesce(v_allergens, '{}')),
    'requiredDiet', to_jsonb(coalesce(v_required_diet, '{}')),
    'unsupportedHouseholdNeeds', to_jsonb(coalesce(v_unsupported, '{}')),
    'hasUnsupportedHouseholdNotes', v_notes,
    'inventoryBatches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'batchId', pb.id,
        'canonicalIngredientId', coalesce(i.canonical_id, i.id),
        'remainingQuantity', pb.remaining_quantity,
        'unit', pb.unit,
        'acquiredAt', coalesce(pb.purchased_at, pb.created_at),
        'expirationStatus', evaluation.status
      ) order by coalesce(pb.purchased_at, pb.created_at), pb.created_at, pb.id)
      from public.pantry_batches pb
      join public.ingredients i on i.id = pb.ingredient_id
      left join public.ingredient_expiration_profiles canonical_mapping
        on canonical_mapping.ingredient_id = coalesce(i.canonical_id, i.id)
      left join public.ingredient_expiration_profiles direct_mapping
        on direct_mapping.ingredient_id = i.id
      left join public.expiration_profiles expiration_profile
        on expiration_profile.id = coalesce(canonical_mapping.profile_id, direct_mapping.profile_id)
      cross join lateral public.evaluate_expiration_state(
        expiration_profile.min_days,
        expiration_profile.max_days,
        expiration_profile.priority_eligible,
        coalesce(pb.purchased_at, pb.created_at),
        p_evaluated_at
      ) evaluation
      where pb.household_id = p_household_id
        and coalesce(pb.remaining_quantity, 0) > 0
    ), '[]'::jsonb),
    'recipeInputs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recipeId', r.id,
        'tasteAffinity', coalesce((
          select max(1 - (r.embedding operator(public.<=>) seed.embedding))
          from public.user_recipes ur
          join public.household_members hm2 on hm2.user_id = ur.user_id
          join public.recipes seed on seed.id = ur.recipe_id
          where hm2.household_id = p_household_id
            and (ur.is_favorite or ur.rating >= 4)
            and seed.embedding is not null
            and r.embedding is not null
        ), 0),
        'allergens', to_jsonb(r.allergens),
        'diet', to_jsonb(r.diet),
        'mealTypes', to_jsonb(r.meal_types),
        'seasons', to_jsonb(coalesce(sp.seasons, '{}')),
        'seasonConfidence', sp.confidence,
        'seasonSource', sp.source,
        'seasonClassifierVersion', sp.classifier_version,
        'ingredients', coalesce((
          select jsonb_agg(jsonb_build_object(
            'ingredientId', ing.value->>'ingredient_id',
            'canonicalIngredientId', case when ri.id is null then null else coalesce(ri.canonical_id, ri.id) end,
            'canonicalName', case when canonical_ri.id is null then null else canonical_ri.normalized_name end,
            'name', coalesce(ing.value->>'name', 'Ingrediente sin nombre'),
            'requiredQuantity', case
              when (ing.value->>'quantity') ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (ing.value->>'quantity')::numeric
              else null
            end,
            'unit', nullif(ing.value->>'unit', ''),
            'safetyAllergens', case when sap.ingredient_id is null then null else to_jsonb(coalesce(sa.allergens, '{}')) end,
            'safetyIncompatibleDiets', case when sap.ingredient_id is null then null else to_jsonb(coalesce(sd.diets, '{}')) end,
            'safetyCompositionStatus', sap.composition_status,
            'safetyProfileVersion', sap.dataset_version
          ) order by ing.ordinality)
          from jsonb_array_elements(coalesce(r.ingredients, '[]'::jsonb)) with ordinality ing(value, ordinality)
          left join lateral (
            select case
              when ing.value->>'ingredient_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then (ing.value->>'ingredient_id')::uuid
              else null
            end as id
          ) raw on true
          left join public.ingredients ri on ri.id = raw.id
          left join public.ingredients canonical_ri on canonical_ri.id = coalesce(ri.canonical_id, ri.id)
          left join public.ingredient_allergen_profiles sap on sap.ingredient_id = ri.id
          left join lateral (
            select array_agg(e.allergen order by e.allergen) as allergens
            from public.ingredient_allergen_entries e
            where e.ingredient_id = sap.ingredient_id
          ) sa on true
          left join lateral (
            select array_agg(e.incompatible_diet order by e.incompatible_diet) as diets
            from public.ingredient_diet_entries e
            where e.ingredient_id = sap.ingredient_id
          ) sd on true
        ), '[]'::jsonb)
      ) order by r.id)
      from public.recipes r
      left join public.recipe_season_profiles sp on sp.recipe_id = r.id
      -- La franja se filtra aquí y no después del corte de candidatas: con 451 recetas de
      -- almuerzo y 53 de desayuno, filtrar al final dejaba el desayuno sin candidatas y
      -- obligaba a caer en el fallback sin franja. Las recetas sin franja valen para todas.
      where r.reusable
        -- Una receta retirada no vuelve a la Home ni al chat, pero sigue accesible por id para
        -- quien la tenía guardada.
        and r.retired_at is null
        and (
          v_meal_type is null
          or r.meal_types is null
          or cardinality(r.meal_types) = 0
          or r.meal_types @> array[v_meal_type]
        )
    ), '[]'::jsonb)
  ) into v_snapshot;

  return v_snapshot;
end;
$$;

revoke execute on function public.build_household_recommendation_snapshot(uuid, uuid, timestamptz, text)
from public, anon, authenticated;

create or replace function match_recipes(
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
    and r.retired_at is null
    and 1 - (r.embedding <=> query_embedding) >= match_threshold
    and (cardinality(exclude_allergens) = 0
         or (r.allergens is not null and not (r.allergens && exclude_allergens)))
    and (cardinality(require_diet) = 0
         or (r.diet is not null and r.diet @> require_diet))
  order by r.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.household_taste_recommendations(p_limit integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_household_id uuid;
  v_exclude_allergens text[] := '{}';
  v_require_diet text[] := '{}';
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'no autenticado' using errcode = '42501';
  end if;
  v_household_id := public.current_household_id();
  if v_household_id is null then
    raise exception 'hogar no encontrado' using errcode = '42501';
  end if;
  perform public.require_household_member(v_household_id);

  -- Alérgenos a excluir del hogar (mismo mapa y needs que build_household_recommendation_snapshot).
  select coalesce(array_agg(distinct m.allergen), '{}')
  into v_exclude_allergens
  from public.household_members hm
  join public.user_preferences up on up.user_id = hm.user_id
  cross join lateral unnest(up.special_needs) as need(value)
  join public.need_allergen_map m
    on m.need = need.value
   and m.need in (
     'Frutos secos', 'Cacahuete', 'Marisco', 'Pescado', 'Huevo', 'Leche', 'Soja',
     'Sésamo', 'Mostaza', 'Apio', 'Lactosa', 'Gluten / celiaquía', 'Sin cerdo', 'Sin alcohol'
   )
  where hm.household_id = v_household_id;

  -- Dietas requeridas del usuario que pide.
  select coalesce(array_agg(distinct d.diet), '{}')
  into v_require_diet
  from public.user_preferences up
  cross join lateral unnest(up.food_prefs) as pref(value)
  join public.pref_diet_map d on d.pref = pref.value
  where up.user_id = v_user_id;

  -- `scored` calcula card+afinidad; `top` filtra sin afinidad y recorta a las p_limit más afines
  -- ANTES de agregar (el limit debe ir en subconsulta, no sobre el jsonb_agg).
  select coalesce(jsonb_agg(card order by affinity desc), '[]'::jsonb)
  into v_result
  from (
    select card, affinity
    from (
      select
        jsonb_build_object(
          'recipeId', r.id, 'title', r.title,
          'imageUrl', r.image_url, 'imageStatus', r.image_status,
          'mode', 'discover', 'missingIngredientCount', null, 'reasons', jsonb_build_array('taste_match')
        ) as card,
        (
          select max(1 - (r.embedding operator(public.<=>) seed.embedding))
          from public.user_recipes ur
          join public.household_members hm on hm.user_id = ur.user_id
          join public.recipes seed on seed.id = ur.recipe_id
          where hm.household_id = v_household_id
            and (ur.is_favorite or ur.rating >= 4)
            and seed.embedding is not null
        ) as affinity
      from public.recipes r
      where r.reusable
        and r.retired_at is null
        and r.embedding is not null
        and not exists (
          select 1 from public.user_recipes ur2
          join public.household_members hm3 on hm3.user_id = ur2.user_id
          where hm3.household_id = v_household_id
            and ur2.recipe_id = r.id
            and (ur2.is_favorite or ur2.rating >= 4)
        )
        and (cardinality(v_exclude_allergens) = 0
             or r.allergens is null
             or not (r.allergens && v_exclude_allergens))
        and (cardinality(v_require_diet) = 0 or r.diet @> v_require_diet)
    ) scored
    where affinity is not null
    order by affinity desc
    limit p_limit
  ) top;

  return v_result;
end;
$$;

revoke execute on function public.household_taste_recommendations(integer) from public, anon;
grant execute on function public.household_taste_recommendations(integer) to authenticated;

create or replace function public.discover_recipes_by_ingredients(
  p_ingredient_ids uuid[],
  p_max_extra integer default 2,
  p_limit integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_selected uuid[];
  v_household_id uuid := public.current_household_id();
  v_warn text[] := '{}';
  v_result jsonb;
begin
  if p_ingredient_ids is null or cardinality(p_ingredient_ids) = 0 then
    return '[]'::jsonb;
  end if;

  -- Canónicos de los ingredientes elegidos.
  select coalesce(array_agg(distinct coalesce(i.canonical_id, i.id)), '{}')
  into v_selected
  from public.ingredients i
  where i.id = any(p_ingredient_ids);

  -- Alérgenos que chocan con las necesidades del hogar (solo para avisar, no filtra).
  if v_household_id is not null then
    select coalesce(array_agg(distinct m.allergen), '{}')
    into v_warn
    from public.household_members hm
    join public.user_preferences up on up.user_id = hm.user_id
    cross join lateral unnest(up.special_needs) as need(value)
    join public.need_allergen_map m
      on m.need = need.value
     and m.need in (
       'Frutos secos', 'Cacahuete', 'Marisco', 'Pescado', 'Huevo', 'Leche', 'Soja',
       'Sésamo', 'Mostaza', 'Apio', 'Lactosa', 'Gluten / celiaquía', 'Sin cerdo', 'Sin alcohol'
     )
    where hm.household_id = v_household_id;
  end if;

  select coalesce(jsonb_agg(card order by uses desc, extras asc, has_image desc, rnd), '[]'::jsonb)
  into v_result
  from (
    select
      jsonb_build_object(
        'recipeId', x.id,
        'title', x.title,
        'description', x.description,
        'imageUrl', x.image_url,
        'imageStatus', x.image_status,
        'extras', x.extras,
        'ingredientNames', x.names,
        'warnAllergens', to_jsonb(
          coalesce(array(select unnest(x.allergens) intersect select unnest(v_warn)), '{}')
        )
      ) as card,
      x.uses as uses,
      x.extras as extras,
      x.has_image as has_image,
      x.rnd as rnd
    from (
      select
        r.id,
        r.title,
        r.description,
        r.image_url,
        r.image_status,
        r.allergens,
        stats.uses,
        stats.extras,
        stats.names,
        (r.image_status = 'ready' and r.image_url is not null) as has_image,
        random() as rnd
      from public.recipes r
      cross join lateral (
        select
          count(*) filter (where ing.canon = any(v_selected)) as uses,
          -- Un ingrediente sin canónico (no catalogado) también es un extra: sin el coalesce, la
          -- comparación con NULL lo dejaría fuera de la cuenta y saltaría el tope.
          count(*) filter (
            where not ing.basic and not coalesce(ing.canon = any(v_selected), false)
          ) as extras,
          coalesce(jsonb_agg(ing.name order by ing.ord), '[]'::jsonb) as names
        from (
          select
            coalesce(ri.canonical_id, ri.id) as canon,
            coalesce(item.value->>'name', 'Ingrediente') as name,
            item.ordinality as ord,
            lower(btrim(coalesce(canonical_ri.normalized_name, ''))) in (
              'sal marina', 'sal gorda', 'sal fina', 'sal de mesa',
              'aceite de oliva virgen extra', 'aceite de oliva suave', 'aceite de girasol',
              'pimienta negra', 'pimienta de sichuan', 'sal y pimienta'
            ) as basic
          from jsonb_array_elements(coalesce(r.ingredients, '[]'::jsonb)) with ordinality item(value, ordinality)
          left join lateral (
            select case
              when item.value->>'ingredient_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then (item.value->>'ingredient_id')::uuid
              else null
            end as id
          ) raw on true
          left join public.ingredients ri on ri.id = raw.id
          left join public.ingredients canonical_ri on canonical_ri.id = coalesce(ri.canonical_id, ri.id)
        ) ing
      ) stats
      where r.reusable
        and r.retired_at is null
    ) x
    where x.uses >= 1
      -- El tope depende de cuántos ingredientes eligió el usuario, no de cuántos canónicos
      -- distintos resultan: dos variantes del mismo canónico siguen siendo dos elecciones.
      and (cardinality(p_ingredient_ids) < 2 or x.extras <= p_max_extra)
    order by x.uses desc, x.extras asc, x.has_image desc, x.rnd
    limit p_limit
  ) ranked;

  return v_result;
end;
$$;

revoke execute on function public.discover_recipes_by_ingredients(uuid[], integer, integer)
  from public, anon;
grant execute on function public.discover_recipes_by_ingredients(uuid[], integer, integer)
  to authenticated;

-- La cobertura cuenta solo recetas publicadas: retirar un duplicado no añade cobertura, y si la
-- vista siguiera contándolo mediríamos el avance de la fase B con una regla falsa.
create or replace view public.ingredient_recipe_coverage
with (security_invoker = true) as
with recipe_canonical_ingredients as (
  -- distinct: una receta que menciona dos variantes del mismo canónico cuenta una vez, no dos.
  -- El join descarta las filas sin ingredient_id, que no se pueden atribuir a ningún canónico.
  select distinct
    r.id as recipe_id,
    r.reusable,
    coalesce(i.canonical_id, i.id) as canonical_ingredient_id
  from public.recipes r
  cross join lateral jsonb_array_elements(coalesce(r.ingredients, '[]'::jsonb)) as ing(value)
  join public.ingredients i on i.id = (ing.value->>'ingredient_id')::uuid
  where r.retired_at is null
)
select
  canonical.id as ingredient_id,
  canonical.name,
  canonical.category,
  count(usage.recipe_id) as recipe_count,
  count(usage.recipe_id) filter (where usage.reusable) as reusable_recipe_count
from public.ingredients canonical
-- left join: los ingredientes sin ninguna receta son justamente la lista de trabajo.
left join recipe_canonical_ingredients usage
  on usage.canonical_ingredient_id = canonical.id
where canonical.canonical_id is null
group by canonical.id, canonical.name, canonical.category;

-- Retira las copias sobrantes de cada título repetido y devuelve cuántas retiró. Va como función
-- y no como update dentro de la migración por dos razones: un update de una sola ejecución no se
-- puede probar (la base local no tiene ni una receta), y el slice siguiente genera cientos de
-- recetas que traerán duplicados nuevos.
--
-- El título se compara tal cual, sin normalizar: es como se midieron los 50 títulos repetidos, y
-- normalizar agruparía platos que solo coinciden al quitarles los acentos.
create function public.retire_duplicate_recipes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retired integer;
begin
  with candidates as (
    select
      r.id,
      r.title,
      r.image_status,
      r.created_at,
      -- Si alguien la tiene guardada o valorada, es la que se queda: retirar la suya la dejaría
      -- fuera del catálogo sin que él haya hecho nada.
      exists (select 1 from public.user_recipes ur where ur.recipe_id = r.id) as saved
    from public.recipes r
    where r.reusable
      and r.retired_at is null
  ),
  ranked as (
    select
      id,
      row_number() over (
        partition by title
        order by saved desc, (image_status = 'ready') desc, created_at, id
      ) as position
    from candidates
  )
  update public.recipes r
  set retired_at = now(), retired_reason = 'duplicate'
  from ranked
  where r.id = ranked.id
    and ranked.position > 1;

  get diagnostics v_retired = row_count;
  return v_retired;
end;
$$;

revoke execute on function public.retire_duplicate_recipes() from public, anon, authenticated;
