-- Los líquidos se sembraron con unidades de contenedor (botella/brick/lata), que no son
-- convertibles a las unidades de las recetas (ml/l/cucharada). Al cocinar no se descontaban
-- (computeCookDeltas omite lo no comparable). Se pasan a unidades volumétricas (l/ml) para
-- que el descuento sea preciso. Solo cambia el default del catálogo (afecta a los ítems que
-- se añadan a partir de ahora); los ítems ya en la despensa conservan su unidad.

-- Aceites: se compran y guardan por litro.
update ingredients set default_unit = 'l', default_min_stock = 0.5
where default_unit = 'botella' and normalized_name like 'aceite %';

-- Resto de botella (vinagres, salsas líquidas, esencias): dosis pequeñas, en ml.
update ingredients set default_unit = 'ml', default_min_stock = 50
where default_unit = 'botella';

-- Caldos, fondos y leches: por litro.
update ingredients set default_unit = 'l', default_min_stock = 0.5
where default_unit = 'brick'
  and (normalized_name like 'caldo %' or normalized_name = 'fondo de carne' or normalized_name like 'leche %');

-- Resto de brick (natas, tomate triturado/frito): en ml.
update ingredients set default_unit = 'ml', default_min_stock = 100
where default_unit = 'brick';

-- Leches líquidas en lata (coco, evaporada): en ml. Los enlatados sólidos (atún, maíz,
-- anchoa, tomate triturado…) se quedan en lata.
update ingredients set default_unit = 'ml', default_min_stock = 100
where default_unit = 'lata' and normalized_name like 'leche %';
