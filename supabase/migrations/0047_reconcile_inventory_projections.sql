-- Cada lote pertenece a una proyección concreta. Esto impide que un ajuste manual
-- deje stock consumible que ya no sea visible en la despensa.
alter table public.pantry_batches
  add column pantry_item_id uuid references public.pantry_items (id) on delete set null;

update public.pantry_batches b
set pantry_item_id = (
  select p.id from public.pantry_items p
  where p.household_id = b.household_id
    and p.ingredient_id is not distinct from b.ingredient_id
    and p.unit is not distinct from b.unit
  order by p.id
  limit 1
)
where b.pantry_item_id is null;

create index pantry_batches_pantry_item_idx on public.pantry_batches (pantry_item_id);

create or replace function public.add_pantry_item(
  p_name text, p_quantity numeric, p_unit text, p_category text, p_ingredient_id uuid, p_min_stock numeric,
  p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_household uuid := public.current_household_id(); v_user uuid; v_command record; v_item uuid; v_batch uuid;
begin
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  v_user := public.require_household_member(v_household);
  select * into v_command from public.begin_inventory_command(v_household, p_idempotency_key, 'adjustment');
  if not v_command.is_new then return (v_command.cached_result ->> 'pantry_item_id')::uuid; end if;
  if p_quantity is not null and p_quantity < 0 then raise exception 'cantidad inválida'; end if;
  insert into public.pantry_items (user_id, household_id, ingredient_id, name, quantity, unit, category, min_stock)
  values (v_user, v_household, p_ingredient_id, p_name, p_quantity, p_unit, p_category, p_min_stock) returning id into v_item;
  insert into public.pantry_batches (household_id, pantry_item_id, ingredient_id, name, category, unit, initial_quantity, remaining_quantity, source)
  values (v_household, v_item, p_ingredient_id, p_name, p_category, p_unit, p_quantity, p_quantity, 'manual') returning id into v_batch;
  insert into public.inventory_events (household_id, command_id, batch_id, ingredient_id, event_type, quantity_delta, unit, source, actor_user_id)
  values (v_household, v_command.command_id, v_batch, p_ingredient_id, 'adjustment', p_quantity, p_unit, 'manual', v_user);
  perform public.finish_inventory_command(v_command.command_id, jsonb_build_object('pantry_item_id', v_item)); return v_item;
end;
$$;

create or replace function public.complete_shopping_items(p_ids uuid[], p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_household uuid := public.current_household_id(); v_user uuid; v_command record; v_item record; v_batch uuid; v_pantry uuid; v_category text; v_result jsonb := '{"pantry_item_ids":[]}'::jsonb;
begin
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  v_user := public.require_household_member(v_household);
  select * into v_command from public.begin_inventory_command(v_household, p_idempotency_key, 'purchase');
  if not v_command.is_new then return v_command.cached_result; end if;
  for v_item in select * from public.shopping_list_items where id = any(p_ids) and household_id = v_household for update loop
    select i.category into v_category from public.ingredients i where i.id = v_item.ingredient_id;
    select p.id into v_pantry from public.pantry_items p where p.household_id = v_household and p.unit is not distinct from v_item.unit and ((v_item.ingredient_id is not null and p.ingredient_id = v_item.ingredient_id) or (v_item.ingredient_id is null and lower(p.name) = lower(v_item.name))) order by p.id limit 1 for update;
    if v_pantry is null then
      insert into public.pantry_items (user_id, household_id, ingredient_id, name, quantity, unit, category) values (v_user, v_household, v_item.ingredient_id, v_item.name, v_item.quantity, v_item.unit, coalesce(v_category, 'Otros')) returning id into v_pantry;
    else update public.pantry_items set quantity = coalesce(quantity, 0) + coalesce(v_item.quantity, 0), updated_at = now() where id = v_pantry; end if;
    insert into public.pantry_batches (household_id, pantry_item_id, ingredient_id, name, category, unit, initial_quantity, remaining_quantity, source, purchased_at)
    values (v_household, v_pantry, v_item.ingredient_id, v_item.name, coalesce(v_category, 'Otros'), v_item.unit, v_item.quantity, v_item.quantity, 'purchase', now()) returning id into v_batch;
    insert into public.inventory_events (household_id, command_id, batch_id, ingredient_id, event_type, quantity_delta, unit, source, actor_user_id) values (v_household, v_command.command_id, v_batch, v_item.ingredient_id, 'purchase', v_item.quantity, v_item.unit, 'shopping_list', v_user);
    v_result := jsonb_set(v_result, '{pantry_item_ids}', (v_result -> 'pantry_item_ids') || to_jsonb(v_pantry));
  end loop;
  delete from public.shopping_list_items where id = any(p_ids) and household_id = v_household;
  return public.finish_inventory_command(v_command.command_id, v_result);
end;
$$;

create or replace function public.set_pantry_quantity(p_item_id uuid, p_quantity numeric, p_idempotency_key uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_household uuid := public.current_household_id(); v_user uuid; v_command record; v_item public.pantry_items%rowtype; v_delta numeric; v_remaining numeric; b record; v_sub numeric; v_batch uuid;
begin
  if p_quantity < 0 then raise exception 'cantidad inválida'; end if;
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  v_user := public.require_household_member(v_household);
  select * into v_command from public.begin_inventory_command(v_household, p_idempotency_key, 'adjustment');
  if not v_command.is_new then return; end if;
  select * into v_item from public.pantry_items where id = p_item_id and household_id = v_household for update;
  if not found then raise exception 'item no encontrado'; end if;
  v_delta := p_quantity - coalesce(v_item.quantity, 0);
  if v_delta > 0 then
    insert into public.pantry_batches (household_id, pantry_item_id, ingredient_id, name, category, unit, initial_quantity, remaining_quantity, source) values (v_household, p_item_id, v_item.ingredient_id, v_item.name, v_item.category, v_item.unit, v_delta, v_delta, 'manual') returning id into v_batch;
    insert into public.inventory_events (household_id, command_id, batch_id, ingredient_id, event_type, quantity_delta, unit, source, actor_user_id) values (v_household, v_command.command_id, v_batch, v_item.ingredient_id, 'adjustment', v_delta, v_item.unit, 'manual', v_user);
  elsif v_delta < 0 then
    v_remaining := -v_delta;
    for b in select * from public.pantry_batches where household_id = v_household and pantry_item_id = p_item_id and coalesce(remaining_quantity,0) > 0 order by coalesce(purchased_at,created_at), created_at, id for update loop
      exit when v_remaining <= 0;
      v_sub := least(b.remaining_quantity, v_remaining);
      update public.pantry_batches set remaining_quantity = remaining_quantity - v_sub where id = b.id;
      insert into public.inventory_events (household_id, command_id, batch_id, ingredient_id, event_type, quantity_delta, unit, source, actor_user_id) values (v_household, v_command.command_id, b.id, b.ingredient_id, 'adjustment', -v_sub, b.unit, 'manual', v_user);
      v_remaining := v_remaining - v_sub;
    end loop;
    if v_remaining > 0 then raise exception 'lotes no reconciliados para el item'; end if;
  end if;
  update public.pantry_items set quantity = p_quantity, updated_at = now() where id = p_item_id;
  perform public.finish_inventory_command(v_command.command_id, jsonb_build_object('pantry_item_id', p_item_id));
end;
$$;

create or replace function public.remove_pantry_item(p_item_id uuid, p_idempotency_key uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_household uuid := public.current_household_id(); v_user uuid; v_command record; v_item public.pantry_items%rowtype; b record;
begin
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  v_user := public.require_household_member(v_household);
  select * into v_command from public.begin_inventory_command(v_household, p_idempotency_key, 'adjustment');
  if not v_command.is_new then return; end if;
  select * into v_item from public.pantry_items where id=p_item_id and household_id=v_household for update;
  if not found then raise exception 'item no encontrado'; end if;
  for b in select * from public.pantry_batches where household_id=v_household and pantry_item_id=p_item_id and coalesce(remaining_quantity,0)>0 for update loop
    update public.pantry_batches set remaining_quantity=0 where id=b.id;
    insert into public.inventory_events (household_id,command_id,batch_id,ingredient_id,event_type,quantity_delta,unit,source,actor_user_id) values (v_household,v_command.command_id,b.id,b.ingredient_id,'waste',-b.remaining_quantity,b.unit,'manual',v_user);
  end loop;
  delete from public.pantry_items where id=p_item_id;
  perform public.finish_inventory_command(v_command.command_id,jsonb_build_object('pantry_item_id',p_item_id));
end;
$$;

create or replace function public.restore_cooked_recipe(p_cooked_id uuid, p_idempotency_key uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_household uuid:=public.current_household_id(); v_user uuid; v_command record; v_cooked public.cooked_recipes%rowtype; d record; v_batch public.pantry_batches%rowtype; v_item uuid;
begin
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  v_user:=public.require_household_member(v_household);
  select * into v_command from public.begin_inventory_command(v_household,p_idempotency_key,'restore');
  if not v_command.is_new then return; end if;
  select * into v_cooked from public.cooked_recipes where id=p_cooked_id and household_id=v_household for update;
  if not found or v_cooked.restored_at is not null then perform public.finish_inventory_command(v_command.command_id,jsonb_build_object('cooked_id',p_cooked_id)); return; end if;
  for d in select (delta->>'pantry_item_id')::uuid pantry_item_id,(delta->>'batch_id')::uuid batch_id,(delta->>'quantity')::numeric quantity from jsonb_array_elements(v_cooked.pantry_deltas) delta loop
    select * into v_batch from public.pantry_batches where id=d.batch_id and household_id=v_household for update;
    if found then
      v_item:=d.pantry_item_id;
      if v_item is null or not exists (select 1 from public.pantry_items where id=v_item and household_id=v_household) then
        insert into public.pantry_items (id,user_id,household_id,ingredient_id,name,quantity,unit,category) values (coalesce(v_item,gen_random_uuid()),v_user,v_household,v_batch.ingredient_id,v_batch.name,0,v_batch.unit,v_batch.category) returning id into v_item;
      end if;
      update public.pantry_batches set remaining_quantity=coalesce(remaining_quantity,0)+d.quantity, pantry_item_id=v_item where id=v_batch.id;
      update public.pantry_items set quantity=coalesce(quantity,0)+d.quantity, updated_at=now() where id=v_item;
      insert into public.inventory_events (household_id,command_id,batch_id,ingredient_id,event_type,quantity_delta,unit,source,actor_user_id) values (v_household,v_command.command_id,v_batch.id,v_batch.ingredient_id,'restore',d.quantity,v_batch.unit,'recipe',v_user);
    end if;
  end loop;
  update public.cooked_recipes set restored_at=now() where id=v_cooked.id;
  perform public.finish_inventory_command(v_command.command_id,jsonb_build_object('cooked_id',p_cooked_id));
end;
$$;

grant execute on function public.restore_cooked_recipe(uuid, uuid) to authenticated;
revoke execute on function public.apply_cook(uuid, integer, jsonb), public.buy_shopping_items(uuid[]), public.uncook_recipe(uuid) from public, anon, authenticated;
