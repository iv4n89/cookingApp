-- Canónico de cada ingrediente: variantes/genéricos ("Cebolla", "Cebolla blanca") apuntan a
-- un canónico común. canonical_id null = es su propio canónico. El match despensa<->receta
-- se resuelve por canon(x) = coalesce(canonical_id, id). No se re-apuntan ids existentes.
alter table ingredients add column canonical_id uuid references ingredients (id) on delete set null;
create index ingredients_canonical_id_idx on ingredients (canonical_id);
