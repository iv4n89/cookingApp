create function public.set_pantry_quantity(p_item_id uuid, p_quantity numeric, p_idempotency_key uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := public.current_household_id(); v_user uuid; v_command record; v_item public.pantry_items%rowtype;
  v_delta numeric; v_batch uuid;
begin
  if p_quantity < 0 then raise exception 'cantidad inválida'; end if;
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  v_user := public.require_household_member(v_household);
  select * into v_command from public.begin_inventory_command(v_household, p_idempotency_key, 'adjustment');
  if not v_command.is_new then return; end if;
  select * into v_item from public.pantry_items where id = p_item_id and household_id = v_household for update;
  if not found then raise exception 'item no encontrado'; end if;
  v_delta := p_quantity - coalesce(v_item.quantity, 0);
  update public.pantry_items set quantity = p_quantity, updated_at = now() where id = p_item_id;
  if v_delta <> 0 then
    insert into public.pantry_batches (household_id, ingredient_id, name, category, unit, initial_quantity, remaining_quantity, source)
    values (v_household, v_item.ingredient_id, v_item.name, v_item.category, v_item.unit,
      greatest(v_delta, 0), greatest(v_delta, 0), 'manual') returning id into v_batch;
    insert into public.inventory_events (household_id, command_id, batch_id, ingredient_id, event_type, quantity_delta, unit, source, actor_user_id)
    values (v_household, v_command.command_id, v_batch, v_item.ingredient_id, 'adjustment', v_delta, v_item.unit, 'manual', v_user);
  end if;
  perform public.finish_inventory_command(v_command.command_id, jsonb_build_object('pantry_item_id', p_item_id));
end;
$$;

create function public.remove_pantry_item(p_item_id uuid, p_idempotency_key uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_household uuid := public.current_household_id(); v_user uuid; v_command record; v_item public.pantry_items%rowtype;
begin
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  v_user := public.require_household_member(v_household);
  select * into v_command from public.begin_inventory_command(v_household, p_idempotency_key, 'adjustment');
  if not v_command.is_new then return; end if;
  select * into v_item from public.pantry_items where id = p_item_id and household_id = v_household for update;
  if not found then raise exception 'item no encontrado'; end if;
  insert into public.inventory_events (household_id, command_id, ingredient_id, event_type, quantity_delta, unit, source, actor_user_id)
  values (v_household, v_command.command_id, v_item.ingredient_id, 'waste', -coalesce(v_item.quantity, 0), v_item.unit, 'manual', v_user);
  delete from public.pantry_items where id = p_item_id;
  perform public.finish_inventory_command(v_command.command_id, jsonb_build_object('pantry_item_id', p_item_id));
end;
$$;

grant execute on function public.set_pantry_quantity(uuid, numeric, uuid), public.remove_pantry_item(uuid, uuid) to authenticated;
