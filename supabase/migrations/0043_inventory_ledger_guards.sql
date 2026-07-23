-- Los read models son legibles por miembros, pero solo los comandos pueden mutarlos.
drop policy "pantry_all_household" on public.pantry_items;
create policy "pantry_select_household" on public.pantry_items
  for select to authenticated using (public.is_household_member(household_id));
drop policy "shopping_all_household" on public.shopping_list_items;
create policy "shopping_select_household" on public.shopping_list_items
  for select to authenticated using (public.is_household_member(household_id));
revoke insert, update, delete on public.pantry_items, public.shopping_list_items from authenticated;
