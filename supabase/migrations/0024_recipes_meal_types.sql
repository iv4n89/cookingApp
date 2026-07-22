-- Franjas horarias de cada receta para las sugeridas de la Home (desayuno/almuerzo/merienda/cena).
-- Una receta puede valer para varias. Se rellena por IA al generar y por backfill del pool.
alter table recipes add column meal_types text[] not null default '{}';
create index recipes_meal_types_idx on recipes using gin (meal_types);
