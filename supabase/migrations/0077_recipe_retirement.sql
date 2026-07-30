-- Retirar una receta del catálogo sin borrarla. Borrar no era opción: user_recipes y
-- cooked_recipes tienen clave ajena contra recipes, así que borrar le quita a alguien una receta
-- que había guardado o cocinado. Por eso los 50 títulos duplicados llevaban semanas aplazados.
-- Retirada = retired_at no nulo. Sin columna de estado aparte: sería redundante y permitiría el
-- estado incoherente "publicada con fecha de retirada".

alter table public.recipes
  add column retired_at timestamptz,
  add column retired_reason text;

alter table public.recipes
  add constraint recipes_retired_reason_vocabulary
    check (retired_reason in ('duplicate', 'incoherent', 'bad_image')),
  -- Retirar sin decir por qué no vale: en un mes nadie recordará por qué se fueron 61 recetas.
  add constraint recipes_retired_coherent
    check ((retired_at is null) = (retired_reason is null));

-- Las consultas del catálogo filtran por esto en cada llamada.
create index recipes_published_idx on public.recipes (id) where retired_at is null;
