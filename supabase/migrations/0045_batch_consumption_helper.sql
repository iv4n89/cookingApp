-- Única implementación de consumo: canónico, unidades comparables, FEFO y bloqueo.
create function public.convert_inventory_quantity(p_quantity numeric, p_from text, p_to text)
returns numeric
language sql immutable set search_path = '' as $$
  with units(unit, dimension, factor) as (
    values ('ml','volume',1::numeric), ('l','volume',1000), ('cucharada','volume',15), ('cucharadita','volume',5),
           ('g','mass',1), ('kg','mass',1000)
  ), normalized as (
    select lower(trim(regexp_replace(coalesce(p_from,''), 's$', ''))) as from_unit,
           lower(trim(regexp_replace(coalesce(p_to,''), 's$', ''))) as to_unit
  )
  select case
    when n.from_unit = n.to_unit then p_quantity
    when a.dimension = b.dimension then p_quantity * a.factor / b.factor
    else null
  end from normalized n left join units a on a.unit = n.from_unit left join units b on b.unit = n.to_unit;
$$;

create function public.consume_household_batches(
  p_household_id uuid, p_ingredient_id uuid, p_quantity numeric, p_unit text, p_command_id uuid, p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_need numeric := p_quantity; b record; v_sub numeric; v_in_batch numeric; v_in_recipe numeric; v_pantry uuid; v_result jsonb := '[]'::jsonb;
begin
  for b in
    select pb.*, coalesce(i.canonical_id, i.id) as canonical_id
    from public.pantry_batches pb join public.ingredients i on i.id = pb.ingredient_id
    where pb.household_id = p_household_id and coalesce(pb.remaining_quantity,0) > 0
      and coalesce(i.canonical_id,i.id) = (select coalesce(canonical_id,id) from public.ingredients where id = p_ingredient_id)
    order by coalesce(pb.purchased_at,pb.created_at), pb.created_at, pb.id for update
  loop
    exit when v_need <= 0;
    v_in_batch := public.convert_inventory_quantity(v_need, p_unit, b.unit);
    if v_in_batch is null then continue; end if;
    v_sub := least(b.remaining_quantity, v_in_batch);
    v_in_recipe := public.convert_inventory_quantity(v_sub, b.unit, p_unit);
    update public.pantry_batches set remaining_quantity = remaining_quantity - v_sub where id = b.id;
    select p.id into v_pantry from public.pantry_items p where p.household_id=p_household_id and p.ingredient_id=b.ingredient_id and p.unit is not distinct from b.unit order by p.id limit 1 for update;
    if v_pantry is not null then update public.pantry_items set quantity=greatest(coalesce(quantity,0)-v_sub,0), updated_at=now() where id=v_pantry; end if;
    insert into public.inventory_events (household_id,command_id,batch_id,ingredient_id,event_type,quantity_delta,unit,source,actor_user_id)
    values (p_household_id,p_command_id,b.id,b.ingredient_id,'consume',-v_sub,b.unit,'recipe',p_actor);
    v_result := v_result || jsonb_build_object('pantry_item_id',v_pantry,'batch_id',b.id,'quantity',v_sub);
    v_need := v_need - v_in_recipe;
  end loop;
  return v_result;
end;
$$;

revoke execute on function public.convert_inventory_quantity(numeric,text,text), public.consume_household_batches(uuid,uuid,numeric,text,uuid,uuid) from public, anon, authenticated;
