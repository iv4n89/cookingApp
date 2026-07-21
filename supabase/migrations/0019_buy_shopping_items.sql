-- Al marcar items como comprados, se movían fuera de la lista pero no se añadían a la
-- despensa (estaba pendiente). Esta función los pasa a pantry_items —fusionando con el
-- item equivalente (mismo ingrediente de catálogo o mismo nombre) y misma unidad, sumando
-- cantidades— y los borra de la lista, todo del propio usuario.
create function buy_shopping_items(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  s record;
  v_existing uuid;
  v_cat text;
begin
  if v_user is null then
    raise exception 'no autenticado';
  end if;

  for s in
    select id, name, quantity, unit, ingredient_id
    from public.shopping_list_items
    where id = any(p_ids) and user_id = v_user
  loop
    -- Item de despensa equivalente y con la misma unidad (para no sumar peras con brics).
    select id into v_existing
    from public.pantry_items
    where user_id = v_user
      and unit is not distinct from s.unit
      and (
        (s.ingredient_id is not null and ingredient_id = s.ingredient_id)
        or (s.ingredient_id is null and lower(name) = lower(s.name))
      )
    limit 1;

    if v_existing is not null then
      update public.pantry_items
      set quantity = coalesce(quantity, 0) + coalesce(s.quantity, 0), updated_at = now()
      where id = v_existing;
    else
      select category into v_cat from public.ingredients where id = s.ingredient_id;
      insert into public.pantry_items (user_id, ingredient_id, name, quantity, unit, category)
      values (v_user, s.ingredient_id, s.name, s.quantity, s.unit, coalesce(v_cat, 'Otros'));
    end if;
  end loop;

  delete from public.shopping_list_items where id = any(p_ids) and user_id = v_user;
end;
$$;

grant execute on function buy_shopping_items(uuid[]) to authenticated;
