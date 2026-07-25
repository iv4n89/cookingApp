-- Descubridor: recetas que encajan con un conjunto de ingredientes elegidos. El match es por
-- canónico (elegir "cebolla" casa con "cebolla blanca") y los básicos asumidos (sal, aceite,
-- pimienta) no cuentan como ingrediente extra. Con 2+ ingredientes elegidos se aplica el tope de
-- extras; con uno solo no, para el modo "pollo, a ver qué sale".
-- No filtra por alérgenos: devuelve warnAllergens para que el cliente avise.
create function public.discover_recipes_by_ingredients(
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
