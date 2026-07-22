-- Deshacer un cocinado no restauraba el ingrediente si su fila de despensa se había borrado
-- entre medias (el UPDATE no casaba y aun así se borraba la entrada de historial). Ahora
-- apply_cook guarda en cada delta los metadatos del item (name/unit/ingredient_id/category), y
-- uncook_recipe, si el item ya no existe, lo recrea. Los cocinados antiguos (deltas sin
-- metadatos) siguen comportándose como antes (no se puede recrear lo que no se guardó).

-- apply_cook: guarda metadatos del item en cada delta.
create or replace function apply_cook(p_recipe_id uuid, p_servings int, p_deltas jsonb)
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
  v_name text;
  v_unit text;
  v_iid uuid;
  v_cat text;
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
    select quantity, name, unit, ingredient_id, category
      into v_before, v_name, v_unit, v_iid, v_cat
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
    v_deltas := v_deltas || jsonb_build_object(
      'pantry_item_id', d.item_id,
      'quantity', v_sub,
      'name', v_name,
      'unit', v_unit,
      'ingredient_id', v_iid,
      'category', v_cat
    );
  end loop;

  insert into public.cooked_recipes (user_id, recipe_id, title, servings, pantry_deltas)
  values (v_user, p_recipe_id, v_title, p_servings, v_deltas)
  returning id into v_cooked;

  return v_cooked;
end;
$$;

-- uncook_recipe: restaura sumando el delta; si el item ya no existe y el delta trae metadatos,
-- lo recrea.
create or replace function uncook_recipe(p_cooked_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_deltas jsonb;
  d record;
begin
  if v_user is null then
    raise exception 'no autenticado';
  end if;

  select pantry_deltas into v_deltas
  from public.cooked_recipes where id = p_cooked_id and user_id = v_user;
  if v_deltas is null then
    return;
  end if;

  for d in
    select (delta->>'pantry_item_id')::uuid as item_id,
           (delta->>'quantity')::numeric as qty,
           delta->>'name' as name,
           delta->>'unit' as unit,
           (delta->>'ingredient_id')::uuid as ingredient_id,
           delta->>'category' as category
    from jsonb_array_elements(v_deltas) delta
  loop
    update public.pantry_items
    set quantity = coalesce(quantity, 0) + d.qty, updated_at = now()
    where id = d.item_id and user_id = v_user;

    if not found and d.name is not null then
      insert into public.pantry_items (user_id, ingredient_id, name, quantity, unit, category)
      values (v_user, d.ingredient_id, d.name, d.qty, d.unit, coalesce(d.category, 'Otros'));
    end if;
  end loop;

  delete from public.cooked_recipes where id = p_cooked_id and user_id = v_user;
end;
$$;

grant execute on function apply_cook(uuid, int, jsonb) to authenticated;
grant execute on function uncook_recipe(uuid) to authenticated;
