-- Rankea un conjunto arbitrario de recetas contra la despensa del hogar, reutilizando
-- el evaluador pantry-first (evaluate_recommendation_snapshot). Evita duplicar el SQL
-- grande de build_household_recommendation_snapshot: construye el snapshot completo del
-- hogar y filtra recipeInputs al conjunto pedido (p_recipe_ids) antes de evaluar.
--
-- La llama la Edge Function del chat con el cliente service_role (no el JWT del usuario),
-- así que recibe household_id y user_id EXPLÍCITOS (igual que build_household_recommendation_snapshot)
-- en vez de derivarlos de auth.uid(), y se concede a service_role.
create function public.household_recipe_ranking(
  p_household_id uuid,
  p_user_id uuid,
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
  v_snapshot jsonb;
begin
  if p_household_id is null then
    raise exception 'hogar requerido' using errcode = '22004';
  end if;
  if p_recipe_ids is null or cardinality(p_recipe_ids) = 0 then
    return public.evaluate_recommendation_snapshot(
      jsonb_build_object('recipeInputs', '[]'::jsonb, 'inventoryBatches', '[]'::jsonb), p_limit
    );
  end if;
  v_snapshot := public.build_household_recommendation_snapshot(
    p_household_id, p_user_id, statement_timestamp(), p_meal_type
  );
  v_snapshot := jsonb_set(v_snapshot, '{recipeInputs}', coalesce((
    select jsonb_agg(ri)
    from jsonb_array_elements(v_snapshot->'recipeInputs') ri
    where (ri->>'recipeId')::uuid = any(p_recipe_ids)
  ), '[]'::jsonb));
  return public.evaluate_recommendation_snapshot(v_snapshot, p_limit);
end;
$$;

revoke execute on function public.household_recipe_ranking(uuid, uuid, uuid[], text, integer)
  from public, anon, authenticated;
grant execute on function public.household_recipe_ranking(uuid, uuid, uuid[], text, integer)
  to service_role;
