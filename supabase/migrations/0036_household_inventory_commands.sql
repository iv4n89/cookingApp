-- Casos de uso de inventario. La clave de idempotencia identifica el comando completo,
-- no cada evento individual: una compra puede crear varios lotes y eventos.

create function public.require_household_member(p_household_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'no autenticado'; end if;
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household_id and hm.user_id = v_user
  ) then
    raise exception 'no autorizado para este hogar';
  end if;
  return v_user;
end;
$$;

create function public.begin_inventory_command(p_household_id uuid, p_key uuid, p_kind text)
returns table (command_id uuid, cached_result jsonb, is_new boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_command public.inventory_commands%rowtype;
begin
  v_user := public.require_household_member(p_household_id);
  select * into v_command from public.inventory_commands c
  where c.household_id = p_household_id and c.idempotency_key = p_key;
  if found then
    return query select v_command.id, v_command.result, false;
    return;
  end if;

  insert into public.inventory_commands (household_id, idempotency_key, kind, actor_user_id)
  values (p_household_id, p_key, p_kind, v_user)
  returning id into command_id;
  cached_result := '{}'::jsonb;
  is_new := true;
  return next;
exception when unique_violation then
  select * into v_command from public.inventory_commands c
  where c.household_id = p_household_id and c.idempotency_key = p_key;
  return query select v_command.id, v_command.result, false;
end;
$$;

create function public.finish_inventory_command(p_command_id uuid, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inventory_commands
  set result = p_result, completed_at = now()
  where id = p_command_id;
  return p_result;
end;
$$;

create function public.add_shopping_item(
  p_name text,
  p_quantity numeric,
  p_unit text,
  p_ingredient_id uuid,
  p_recipe_id uuid,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.current_household_id();
  v_user uuid;
  v_command record;
  v_item uuid;
begin
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  v_user := public.require_household_member(v_household);
  select * into v_command from public.begin_inventory_command(v_household, p_idempotency_key, 'adjustment');
  if not v_command.is_new then
    return (v_command.cached_result ->> 'shopping_item_id')::uuid;
  end if;

  insert into public.shopping_list_items (
    user_id, household_id, name, quantity, unit, ingredient_id, recipe_id
  ) values (
    v_user, v_household, p_name, p_quantity, p_unit, p_ingredient_id, p_recipe_id
  ) returning id into v_item;

  perform public.finish_inventory_command(
    v_command.command_id,
    jsonb_build_object('shopping_item_id', v_item)
  );
  return v_item;
end;
$$;

create function public.complete_shopping_items(p_ids uuid[], p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.current_household_id();
  v_user uuid;
  v_command record;
  v_item record;
  v_batch uuid;
  v_pantry uuid;
  v_category text;
  v_result jsonb := '{"pantry_item_ids":[]}'::jsonb;
begin
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  v_user := public.require_household_member(v_household);
  select * into v_command from public.begin_inventory_command(v_household, p_idempotency_key, 'purchase');
  if not v_command.is_new then return v_command.cached_result; end if;

  for v_item in
    select * from public.shopping_list_items
    where id = any(p_ids) and household_id = v_household
    for update
  loop
    select i.category into v_category from public.ingredients i where i.id = v_item.ingredient_id;
    insert into public.pantry_batches (
      household_id, ingredient_id, name, category, unit, initial_quantity, remaining_quantity, source, purchased_at
    ) values (
      v_household, v_item.ingredient_id, v_item.name, coalesce(v_category, 'Otros'), v_item.unit,
      v_item.quantity, v_item.quantity, 'purchase', now()
    ) returning id into v_batch;

    select p.id into v_pantry from public.pantry_items p
    where p.household_id = v_household
      and p.unit is not distinct from v_item.unit
      and ((v_item.ingredient_id is not null and p.ingredient_id = v_item.ingredient_id)
        or (v_item.ingredient_id is null and lower(p.name) = lower(v_item.name)))
    order by p.id limit 1 for update;

    if v_pantry is null then
      insert into public.pantry_items (user_id, household_id, ingredient_id, name, quantity, unit, category)
      values (v_user, v_household, v_item.ingredient_id, v_item.name, v_item.quantity, v_item.unit, coalesce(v_category, 'Otros'))
      returning id into v_pantry;
    else
      update public.pantry_items set quantity = coalesce(quantity, 0) + coalesce(v_item.quantity, 0), updated_at = now()
      where id = v_pantry;
    end if;

    insert into public.inventory_events (
      household_id, command_id, batch_id, ingredient_id, event_type, quantity_delta, unit, source, actor_user_id
    ) values (
      v_household, v_command.command_id, v_batch, v_item.ingredient_id, 'purchase', v_item.quantity,
      v_item.unit, 'shopping_list', v_user
    );
    v_result := jsonb_set(v_result, '{pantry_item_ids}', (v_result -> 'pantry_item_ids') || to_jsonb(v_pantry));
  end loop;

  delete from public.shopping_list_items where id = any(p_ids) and household_id = v_household;
  return public.finish_inventory_command(v_command.command_id, v_result);
end;
$$;

grant execute on function public.add_shopping_item(text, numeric, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.complete_shopping_items(uuid[], uuid) to authenticated;
