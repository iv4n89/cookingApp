-- Stock bajo por ingrediente en vez de un umbral fijo (<= 1) para todo.
-- min_stock: el mínimo que el usuario quiere tener de ese item (bajo = cantidad <= min_stock).
-- El catálogo trae un default (default_min_stock) con su unidad de referencia (default_unit),
-- que se pre-rellena al añadir el ingrediente desde el catálogo.
alter table pantry_items add column min_stock numeric;
alter table ingredients add column default_min_stock numeric;
alter table ingredients add column default_unit text;
