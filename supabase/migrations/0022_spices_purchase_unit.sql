-- Las especias secas se sembraron en gramos, pero se compran y guardan en bote/frasco.
-- Para que la lista de la compra use la unidad típica (p.ej. pimentón -> 1 bote), se pasan
-- a 'bote' con mínimo 1. Las hierbas frescas (ramillete), ajos (cabeza) y azafrán no se tocan.
update ingredients set default_unit = 'bote', default_min_stock = 1
where category = 'Especias y hierbas' and default_unit = 'g';
