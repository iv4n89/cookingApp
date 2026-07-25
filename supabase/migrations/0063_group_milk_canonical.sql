-- Agrupa las variantes de leche de beber (desnatada, semidesnatada) bajo el mismo canónico
-- que "Leche entera", al que ya apunta la genérica "Leche". Así la despensa con "leche desnatada"
-- casa con recetas que piden "leche"/"leche entera", igual que arroz o cebolla (migración 0027).
-- Se resuelve por normalized_name porque los id difieren entre entornos (local vs nube).
-- No toca leches no intercambiables (condensada, evaporada, de coco, suero): siguen sueltas.
update public.ingredients
set canonical_id = (select id from public.ingredients where normalized_name = 'leche entera')
where normalized_name in ('leche desnatada', 'leche semidesnatada');
