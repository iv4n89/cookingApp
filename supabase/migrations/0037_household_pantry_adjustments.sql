-- Ajustes de la proyección de despensa mediante eventos; el cliente no actualiza stock directo.

create function public.add_pantry_item(
  p_name text, p_quantity numeric, p_unit text, p_category text, p_ingredient_id uuid, p_min_stock numeric,
  p_idempotency_key uuid
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := public.current_household_id(); v_user uuid; v_command record; v_item uuid; v_batch uuid;
begin
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  v_user := public.require_household_member(v_household);
  select * into v_command from public.begin_inventory_command(v_household, p_idempotency_key, 'adjustment');
  if not v_command.is_new then return (v_command.cached_result ->> 'pantry_item_id')::uuid; end if;
  if p_quantity is not null and p_quantity < 0 then raise exception 'cantidad inválida'; end if;
  insert into public.pantry_items (user_id, household_id, ingredient_id, name, quantity, unit, category, min_stock)
  values (v_user, v_household, p_ingredient_id, p_name, p_quantity, p_unit, p_category, p_min_stock)
  returning id into v_item;
  insert into public.pantry_batches (household_id, ingredient_id, name, category, unit, initial_quantity, remaining_quantity, source)
  values (v_household, p_ingredient_id, p_name, p_category, p_unit, p_quantity, p_quantity, 'manual') returning id into v_batch;
  insert into public.inventory_events (household_id, command_id, batch_id, ingredient_id, event_type, quantity_delta, unit, source, actor_user_id)
  values (v_household, v_command.command_id, v_batch, p_ingredient_id, 'adjustment', p_quantity, p_unit, 'manual', v_user);
  perform public.finish_inventory_command(v_command.command_id, jsonb_build_object('pantry_item_id', v_item));
  return v_item;
end;
$$;

create function public.set_pantry_min_stock(p_item_id uuid, p_min_stock numeric)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_household uuid := public.current_household_id();
begin
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  perform public.require_household_member(v_household);
  update public.pantry_items set min_stock = p_min_stock, updated_at = now()
  where id = p_item_id and household_id = v_household;
  if not found then raise exception 'item no encontrado'; end if;
end;
$$;

grant execute on function public.add_pantry_item(text, numeric, text, text, uuid, numeric, uuid) to authenticated;
grant execute on function public.set_pantry_min_stock(uuid, numeric) to authenticated;
