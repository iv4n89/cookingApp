-- Rankea un conjunto arbitrario de recetas contra la despensa del hogar, reutilizando
-- el evaluador pantry-first (evaluate_recommendation_snapshot). Evita duplicar el SQL
-- grande de build_household_recommendation_snapshot: construye el snapshot completo del
-- hogar y filtra recipeInputs al conjunto pedido (p_recipe_ids) antes de evaluar.
create function public.household_recipe_ranking(
  p_recipe_ids uuid[],
  p_meal_type text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_household_id uuid;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'no autenticado' using errcode = '42501';
  end if;
  v_household_id := public.current_household_id();
  if v_household_id is null then
    raise exception 'hogar no encontrado' using errcode = '42501';
  end if;
  perform public.require_household_member(v_household_id);
  if p_recipe_ids is null or cardinality(p_recipe_ids) = 0 then
    return public.evaluate_recommendation_snapshot(
      jsonb_build_object('recipeInputs', '[]'::jsonb, 'inventoryBatches', '[]'::jsonb), p_limit
    );
  end if;
  v_snapshot := public.build_household_recommendation_snapshot(
    v_household_id, v_user_id, statement_timestamp(), p_meal_type
  );
  v_snapshot := jsonb_set(v_snapshot, '{recipeInputs}', coalesce((
    select jsonb_agg(ri)
    from jsonb_array_elements(v_snapshot->'recipeInputs') ri
    where (ri->>'recipeId')::uuid = any(p_recipe_ids)
  ), '[]'::jsonb));
  return public.evaluate_recommendation_snapshot(v_snapshot, p_limit);
end;
$$;

revoke execute on function public.household_recipe_ranking(uuid[], text, integer) from public, anon;
grant execute on function public.household_recipe_ranking(uuid[], text, integer) to authenticated;
