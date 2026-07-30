-- Cierra los duplicados que arrastra el catálogo: el 30 de julio había 50 títulos repetidos entre
-- las 504 recetas, 111 recetas implicadas y 61 sobrantes. Estaban aplazados desde el 25 de julio
-- por no tener dónde marcarlos. Esquema en 0077; aquí solo se aplica a los datos.
select public.retire_duplicate_recipes();
