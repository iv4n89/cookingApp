-- Historial de recetas cocinadas + auto-descuento de despensa con deshacer.
create table cooked_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  recipe_id uuid not null references recipes (id) on delete cascade,
  title text not null,
  servings int not null,
  -- Lo restado de cada item de despensa, para poder restaurarlo al deshacer.
  pantry_deltas jsonb not null default '[]',
  cooked_at timestamptz not null default now()
);
create index cooked_recipes_user_time_idx on cooked_recipes (user_id, cooked_at desc);

alter table cooked_recipes enable row level security;
create policy "cooked_select_own" on cooked_recipes
  for select to authenticated using (user_id = (select auth.uid()));
grant select on cooked_recipes to authenticated;
grant select, insert, delete on cooked_recipes to service_role;

-- Cocinar: descuenta de la despensa del usuario los ingredientes de la receta
-- (match por ingredient_id, escalado por raciones), registra lo restado e inserta
-- la entrada de historial. security definer: opera sobre los datos del propio
-- usuario (auth.uid()), validado dentro.
create function cook_recipe(p_recipe_id uuid, p_servings int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_base int;
  v_title text;
  v_deltas jsonb := '[]'::jsonb;
  v_cooked uuid;
  v_item_id uuid;
  v_old numeric;
  v_sub numeric;
  r record;
begin
  if v_user is null then
    raise exception 'no autenticado';
  end if;

  select servings, title into v_base, v_title from public.recipes where id = p_recipe_id;
  if v_title is null then
    raise exception 'receta no encontrada';
  end if;
  if v_base is null or v_base <= 0 then
    v_base := 1;
  end if;

  for r in
    select (ing->>'ingredient_id')::uuid as ingredient_id,
           (ing->>'quantity')::numeric as qty
    from public.recipes rec, jsonb_array_elements(rec.ingredients) ing
    where rec.id = p_recipe_id
      and ing->>'ingredient_id' is not null
      and ing->>'quantity' is not null
  loop
    select id, quantity into v_item_id, v_old
    from public.pantry_items
    where user_id = v_user and ingredient_id = r.ingredient_id and quantity is not null
    limit 1;

    if v_item_id is not null then
      v_sub := round(least(v_old, r.qty * p_servings::numeric / v_base), 3);
      if v_sub > 0 then
        update public.pantry_items set quantity = v_old - v_sub, updated_at = now()
        where id = v_item_id;
        v_deltas := v_deltas || jsonb_build_object('pantry_item_id', v_item_id, 'quantity', v_sub);
      end if;
    end if;
  end loop;

  insert into public.cooked_recipes (user_id, recipe_id, title, servings, pantry_deltas)
  values (v_user, p_recipe_id, v_title, p_servings, v_deltas)
  returning id into v_cooked;

  return v_cooked;
end;
$$;

-- Deshacer: restaura a la despensa lo restado y borra la entrada de historial.
create function uncook_recipe(p_cooked_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_deltas jsonb;
  d record;
begin
  if v_user is null then
    raise exception 'no autenticado';
  end if;

  select pantry_deltas into v_deltas
  from public.cooked_recipes where id = p_cooked_id and user_id = v_user;
  if v_deltas is null then
    return;
  end if;

  for d in
    select (delta->>'pantry_item_id')::uuid as item_id, (delta->>'quantity')::numeric as qty
    from jsonb_array_elements(v_deltas) delta
  loop
    update public.pantry_items
    set quantity = coalesce(quantity, 0) + d.qty, updated_at = now()
    where id = d.item_id and user_id = v_user;
  end loop;

  delete from public.cooked_recipes where id = p_cooked_id and user_id = v_user;
end;
$$;

grant execute on function cook_recipe(uuid, int) to authenticated;
grant execute on function uncook_recipe(uuid) to authenticated;
