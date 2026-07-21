-- El descuento de despensa al cocinar casaba por ingredient_id exacto, pero los ids de
-- receta (nombres del LLM) y de despensa (catálogo específico) casi nunca coinciden, así
-- que no descontaba nada y el "deshacer" no tenía deltas que restaurar. Ahora el cliente
-- calcula qué items descontar (match por nombre, igual que "lo que falta") y esta RPC solo
-- aplica los deltas, recalculando el descuento real contra el stock vivo para registrar
-- exactamente lo restado (uncook_recipe lo restaura tal cual).
drop function if exists cook_recipe(uuid, int);

create function apply_cook(p_recipe_id uuid, p_servings int, p_deltas jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_title text;
  v_deltas jsonb := '[]'::jsonb;
  v_cooked uuid;
  v_before numeric;
  v_sub numeric;
  d record;
begin
  if v_user is null then
    raise exception 'no autenticado';
  end if;
  if p_servings <= 0 then
    raise exception 'raciones inválidas';
  end if;

  select title into v_title from public.recipes where id = p_recipe_id;
  if v_title is null then
    raise exception 'receta no encontrada';
  end if;

  for d in
    select (delta->>'pantry_item_id')::uuid as item_id, (delta->>'quantity')::numeric as qty
    from jsonb_array_elements(p_deltas) delta
  loop
    select quantity into v_before
    from public.pantry_items where id = d.item_id and user_id = v_user;
    if v_before is null then
      continue;
    end if;
    v_sub := least(v_before, d.qty);
    if v_sub <= 0 then
      continue;
    end if;
    update public.pantry_items set quantity = v_before - v_sub, updated_at = now()
    where id = d.item_id;
    v_deltas := v_deltas || jsonb_build_object('pantry_item_id', d.item_id, 'quantity', v_sub);
  end loop;

  insert into public.cooked_recipes (user_id, recipe_id, title, servings, pantry_deltas)
  values (v_user, p_recipe_id, v_title, p_servings, v_deltas)
  returning id into v_cooked;

  return v_cooked;
end;
$$;

grant execute on function apply_cook(uuid, int, jsonb) to authenticated;
