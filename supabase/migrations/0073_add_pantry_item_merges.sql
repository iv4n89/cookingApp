-- add_pantry_item reutiliza el producto que ya esté en la despensa en lugar de crear otro. Añadir a
-- mano algo que ya tienes dejaba dos filas del mismo producto en la alacena y, desde la 0072, dos
-- avisos iguales en el Home. El emparejamiento es el mismo que usa la compra: hogar, unidad e
-- ingrediente, o el nombre si el producto no viene del catálogo. El lote sí es nuevo cada vez:
-- cada alta caduca por su cuenta. El mínimo y la categoría se quedan como estaban; para cambiarlos
-- está set_pantry_min_stock.

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
  select p.id into v_item from public.pantry_items p
  where p.household_id = v_household and p.unit is not distinct from p_unit
    and ((p_ingredient_id is not null and p.ingredient_id = p_ingredient_id)
      or (p_ingredient_id is null and lower(p.name) = lower(p_name)))
  order by p.id limit 1 for update;
  if v_item is null then
    insert into public.pantry_items (user_id, household_id, ingredient_id, name, quantity, unit, category, min_stock)
    values (v_user, v_household, p_ingredient_id, p_name, p_quantity, p_unit, p_category, p_min_stock) returning id into v_item;
  else
    -- Una cantidad nula significa "no la llevo", no cero: sumar dos altas sin cantidad tiene que
    -- dejarla nula, o el producto empezaría a contar como bajo stock sin haberlo medido nunca.
    update public.pantry_items
    set quantity = case when quantity is null and p_quantity is null then null
                        else coalesce(quantity, 0) + coalesce(p_quantity, 0) end,
        updated_at = now()
    where id = v_item;
  end if;
  insert into public.pantry_batches (household_id, pantry_item_id, ingredient_id, name, category, unit, initial_quantity, remaining_quantity, source)
  values (v_household, v_item, p_ingredient_id, p_name, p_category, p_unit, p_quantity, p_quantity, 'manual') returning id into v_batch;
  insert into public.inventory_events (household_id, command_id, batch_id, ingredient_id, event_type, quantity_delta, unit, source, actor_user_id)
  values (v_household, v_command.command_id, v_batch, p_ingredient_id, 'adjustment', p_quantity, p_unit, 'manual', v_user);
  perform public.finish_inventory_command(v_command.command_id, jsonb_build_object('pantry_item_id', v_item)); return v_item;
end;
$$;
