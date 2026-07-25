begin;

select plan(3);

-- canon(x) = coalesce(canonical_id, id): las tres leches de beber + la genérica comparten canónico.
select is(
  (select coalesce(canonical_id, id) from public.ingredients where normalized_name = 'leche desnatada'),
  (select coalesce(canonical_id, id) from public.ingredients where normalized_name = 'leche entera'),
  'Leche desnatada comparte canónico con leche entera'
);
select is(
  (select coalesce(canonical_id, id) from public.ingredients where normalized_name = 'leche semidesnatada'),
  (select coalesce(canonical_id, id) from public.ingredients where normalized_name = 'leche entera'),
  'Leche semidesnatada comparte canónico con leche entera'
);
-- Las leches no intercambiables NO se agrupan con la de beber.
select isnt(
  (select coalesce(canonical_id, id) from public.ingredients where normalized_name = 'leche condensada'),
  (select coalesce(canonical_id, id) from public.ingredients where normalized_name = 'leche entera'),
  'Leche condensada no se agrupa con la leche de beber'
);

select * from finish();
rollback;
