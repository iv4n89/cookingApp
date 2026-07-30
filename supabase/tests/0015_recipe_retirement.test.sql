begin;

select plan(5);

select has_column('public', 'recipes', 'retired_at', 'recipes tiene retired_at');
select has_column('public', 'recipes', 'retired_reason', 'recipes tiene retired_reason');

insert into public.recipes (id, title, source, reusable, image_status)
values ('facade00-0000-4000-8000-000000000001', 'Retirada base', 'generated', true, 'none');

select throws_ok(
  $$update public.recipes set retired_at = now()
    where id = 'facade00-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'No se puede retirar sin decir por qué'
);

select throws_ok(
  $$update public.recipes set retired_reason = 'duplicate'
    where id = 'facade00-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'Un motivo sin fecha de retirada tampoco vale'
);

select throws_ok(
  $$update public.recipes set retired_at = now(), retired_reason = 'porque no me gusta'
    where id = 'facade00-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'El motivo sale de un vocabulario cerrado'
);

select * from finish();
rollback;
