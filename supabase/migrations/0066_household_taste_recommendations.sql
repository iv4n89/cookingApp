-- Carrusel "Para ti": recetas reusables del catálogo más afines al estilo del hogar (máx coseno
-- contra las recetas que sus miembros marcaron favoritas o valoraron >=4), filtradas por
-- alérgenos/dieta del hogar. La llama el móvil directo con el JWT del usuario.
create function public.household_taste_recommendations(p_limit integer default 12)
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
