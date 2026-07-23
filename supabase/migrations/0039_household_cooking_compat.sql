-- Compatibilidad de cocinado compartido mientras el siguiente slice traslada el matching
-- canónico y FEFO completo al comando. Ya no se autoriza ni se descuenta por user_id.
create or replace function public.apply_cook(p_recipe_id uuid, p_servings int, p_deltas jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_household uuid := public.current_household_id(); v_title text; v_deltas jsonb := '[]'::jsonb;
  v_cooked uuid; v_before numeric; v_sub numeric; d record;
begin
  if v_user is null or v_household is null then raise exception 'no autenticado'; end if;
  perform public.require_household_member(v_household);
  if p_servings <= 0 then raise exception 'raciones inválidas'; end if;
  select title into v_title from public.recipes where id = p_recipe_id;
  if v_title is null then raise exception 'receta no encontrada'; end if;
  for d in select (delta->>'pantry_item_id')::uuid as item_id, (delta->>'quantity')::numeric as qty from jsonb_array_elements(p_deltas) delta loop
    select quantity into v_before from public.pantry_items where id = d.item_id and household_id = v_household for update;
    if v_before is null then continue; end if;
    v_sub := least(v_before, d.qty);
    if v_sub <= 0 then continue; end if;
    update public.pantry_items set quantity = v_before - v_sub, updated_at = now() where id = d.item_id;
    v_deltas := v_deltas || jsonb_build_object('pantry_item_id', d.item_id, 'quantity', v_sub);
  end loop;
  insert into public.cooked_recipes (user_id, household_id, recipe_id, title, servings, pantry_deltas)
  values (v_user, v_household, p_recipe_id, v_title, p_servings, v_deltas) returning id into v_cooked;
  return v_cooked;
end;
$$;

create or replace function public.uncook_recipe(p_cooked_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_household uuid := public.current_household_id(); v_deltas jsonb; d record;
begin
  if v_household is null then raise exception 'no autenticado'; end if;
  perform public.require_household_member(v_household);
  select pantry_deltas into v_deltas from public.cooked_recipes where id = p_cooked_id and household_id = v_household;
  if v_deltas is null then return; end if;
  for d in select (delta->>'pantry_item_id')::uuid as item_id, (delta->>'quantity')::numeric as qty from jsonb_array_elements(v_deltas) delta loop
    update public.pantry_items set quantity = coalesce(quantity, 0) + d.qty, updated_at = now() where id = d.item_id and household_id = v_household;
  end loop;
  delete from public.cooked_recipes where id = p_cooked_id and household_id = v_household;
end;
$$;
