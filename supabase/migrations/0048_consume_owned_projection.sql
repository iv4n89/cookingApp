-- Un lote solo puede modificar la proyección a la que pertenece.
create or replace function public.consume_household_batches(
  p_household_id uuid,
  p_ingredient_id uuid,
  p_quantity numeric,
  p_unit text,
  p_command_id uuid,
  p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_need numeric := p_quantity;
  b record;
  v_sub numeric;
  v_in_batch numeric;
  v_in_recipe numeric;
  v_pantry uuid;
  v_result jsonb := '[]'::jsonb;
begin
  for b in
    select pb.*, coalesce(i.canonical_id, i.id) as canonical_id
    from public.pantry_batches pb
    join public.ingredients i on i.id = pb.ingredient_id
    where pb.household_id = p_household_id
      and pb.pantry_item_id is not null
      and coalesce(pb.remaining_quantity, 0) > 0
      and coalesce(i.canonical_id, i.id) = (
        select coalesce(canonical_id, id)
        from public.ingredients
        where id = p_ingredient_id
      )
    order by coalesce(pb.purchased_at, pb.created_at), pb.created_at, pb.id
    for update
  loop
    exit when v_need <= 0;
    v_in_batch := public.convert_inventory_quantity(v_need, p_unit, b.unit);
    if v_in_batch is null then continue; end if;

    select p.id into v_pantry
    from public.pantry_items p
    where p.id = b.pantry_item_id
      and p.household_id = p_household_id
    for update;
    if v_pantry is null then continue; end if;

    v_sub := least(b.remaining_quantity, v_in_batch);
    v_in_recipe := public.convert_inventory_quantity(v_sub, b.unit, p_unit);

    update public.pantry_batches
    set remaining_quantity = remaining_quantity - v_sub
    where id = b.id;

    update public.pantry_items
    set quantity = greatest(coalesce(quantity, 0) - v_sub, 0),
        updated_at = now()
    where id = v_pantry;

    insert into public.inventory_events (
      household_id, command_id, batch_id, ingredient_id,
      event_type, quantity_delta, unit, source, actor_user_id
    ) values (
      p_household_id, p_command_id, b.id, b.ingredient_id,
      'consume', -v_sub, b.unit, 'recipe', p_actor
    );

    v_result := v_result || jsonb_build_object(
      'pantry_item_id', v_pantry,
      'batch_id', b.id,
      'quantity', v_sub
    );
    v_need := v_need - v_in_recipe;
  end loop;
  return v_result;
end;
$$;

revoke execute on function public.consume_household_batches(uuid, uuid, numeric, text, uuid, uuid)
from public, anon, authenticated;
