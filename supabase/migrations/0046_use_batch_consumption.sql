create or replace function public.cook_recipe_for_household(p_recipe_id uuid, p_servings int, p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_household uuid:=public.current_household_id(); v_user uuid; v_command record; v_base int; v_title text; v_cooked uuid; v_deltas jsonb:='[]'::jsonb; r record;
begin
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  v_user:=public.require_household_member(v_household);
  if p_servings<=0 then raise exception 'raciones inválidas'; end if;
  select * into v_command from public.begin_inventory_command(v_household,p_idempotency_key,'cook');
  if not v_command.is_new then return (v_command.cached_result->>'cooked_id')::uuid; end if;
  select servings,title into v_base,v_title from public.recipes where id=p_recipe_id;
  if v_title is null then raise exception 'receta no encontrada'; end if;
  for r in select (i->>'ingredient_id')::uuid as ingredient_id,(i->>'quantity')::numeric as quantity,i->>'unit' as unit from public.recipes rec cross join lateral jsonb_array_elements(rec.ingredients) i where rec.id=p_recipe_id loop
    if r.ingredient_id is not null and r.quantity is not null then
      v_deltas:=v_deltas || public.consume_household_batches(v_household,r.ingredient_id,r.quantity*p_servings/greatest(coalesce(v_base,1),1),r.unit,v_command.command_id,v_user);
    end if;
  end loop;
  insert into public.cooked_recipes(user_id,household_id,recipe_id,title,servings,pantry_deltas) values(v_user,v_household,p_recipe_id,v_title,p_servings,v_deltas) returning id into v_cooked;
  perform public.finish_inventory_command(v_command.command_id,jsonb_build_object('cooked_id',v_cooked)); return v_cooked;
end;
$$;
