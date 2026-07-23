revoke execute on function public.require_household_member(uuid), public.begin_inventory_command(uuid, uuid, text), public.finish_inventory_command(uuid, jsonb) from public, anon, authenticated;

alter table public.cooked_recipes add column restored_at timestamptz;

create or replace function public.uncook_recipe(p_cooked_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_household uuid := public.current_household_id(); v_cooked public.cooked_recipes%rowtype; d record; v_batch public.pantry_batches%rowtype;
begin
  if v_household is null then raise exception 'no autenticado'; end if;
  perform public.require_household_member(v_household);
  select * into v_cooked from public.cooked_recipes where id = p_cooked_id and household_id = v_household for update;
  if not found or v_cooked.restored_at is not null then return; end if;
  for d in select (delta->>'pantry_item_id')::uuid as pantry_item_id, (delta->>'batch_id')::uuid as batch_id, (delta->>'quantity')::numeric as quantity
    from jsonb_array_elements(v_cooked.pantry_deltas) delta
  loop
    select * into v_batch from public.pantry_batches where id = d.batch_id and household_id = v_household for update;
    if found then
      update public.pantry_batches set remaining_quantity = coalesce(remaining_quantity, 0) + d.quantity where id = v_batch.id;
      if d.pantry_item_id is not null then
        update public.pantry_items set quantity = coalesce(quantity, 0) + d.quantity, updated_at = now()
        where id = d.pantry_item_id and household_id = v_household;
      end if;
      insert into public.inventory_events (household_id, batch_id, ingredient_id, event_type, quantity_delta, unit, source, actor_user_id)
      values (v_household, v_batch.id, v_batch.ingredient_id, 'restore', d.quantity, v_batch.unit, 'recipe', auth.uid());
    end if;
  end loop;
  update public.cooked_recipes set restored_at = now() where id = v_cooked.id;
end;
$$;
