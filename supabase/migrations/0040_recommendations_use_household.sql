-- La función de recomendaciones es la versión vigente creada por 0033. Conservamos su
-- implementación y solo sustituimos su fuente de despensa por el hogar autenticado.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.recommended_recipes(integer, integer, text, uuid[])'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    'where p.user_id = v_uid and p.ingredient_id is not null',
    'where p.household_id = public.current_household_id() and p.ingredient_id is not null'
  );
  execute v_definition;
end;
$$;
