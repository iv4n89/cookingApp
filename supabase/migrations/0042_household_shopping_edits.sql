create function public.set_shopping_checked(p_item_id uuid, p_checked boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_household uuid := public.current_household_id();
begin
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  perform public.require_household_member(v_household);
  update public.shopping_list_items set checked = p_checked where id = p_item_id and household_id = v_household;
  if not found then raise exception 'item no encontrado'; end if;
end;
$$;
create function public.update_shopping_item(p_item_id uuid, p_quantity numeric, p_unit text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_household uuid := public.current_household_id();
begin
  if v_household is null then raise exception 'hogar no encontrado'; end if;
  perform public.require_household_member(v_household);
  update public.shopping_list_items set quantity = p_quantity, unit = coalesce(p_unit, unit) where id = p_item_id and household_id = v_household;
  if not found then raise exception 'item no encontrado'; end if;
end;
$$;
grant execute on function public.set_shopping_checked(uuid, boolean), public.update_shopping_item(uuid, numeric, text) to authenticated;
