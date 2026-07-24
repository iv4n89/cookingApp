# Diseño: tanda curada de recetas cotidianas sencillas

Fecha: 2026-07-24. Estado: aprobado (pendiente de revisar la lista de títulos).

## Contexto

El catálogo (369 recetas, media 7,5 ingredientes) está sesgado a platos
complejos/exóticos: con una despensa normal casi todo sale `shop_then_cook`, y
no hay recetas sencillas que usen una proteína común + básicos de despensa
(p. ej. "cerdo con patatas"). Por eso, aun con el motor pantry-first (pieza 2,
ya en `main`), "Cocina esto hoy" destaca una tortilla en vez de aprovechar el
cerdo a punto de caducar: la receta simple de cerdo no existe.

Esta es la pieza 1: ampliar el catálogo con recetas cotidianas sencillas
curadas a mano, sembradas con el pipeline existente. No cambia código: es una
tanda de datos.

## Enfoque

Añadir ~50 recetas a `scripts/seed/recipes.json` y su perfil estacional
correspondiente a `scripts/seed/recipe-season-profiles.json` (el sembrador
`seed-recipes.mjs` exige que cada receta tenga su perfil; falla si no cuadran).
Sembrar con `pnpm` → `seed-recipes.mjs` → Edge Function `index-recipe`, que
embeddea, deduplica (umbral 0,9) y difiere la imagen (`image_status='none'`,
se genera on-demand). Reejecutar es seguro: las 24 curadas y las generadas que
solapen se deduplican.

## Reglas de composición

- **Estilo**: casero español/mediterráneo de diario.
- **Tope**: ≤6 ingredientes totales; 2-3 suelen ser básicos asumidos (sal,
  aceite de oliva, agua) que el motor no cuenta como faltantes, dejando 3-4
  ingredientes "reales" de despensa común. Esto es lo que produce `cook_now` /
  pocos faltantes.
- **Ancladas a proteínas y básicos comunes**: cerdo, pollo, ternera, huevo,
  pescado, atún, legumbres + feculentos/verduras de despensa (patata, arroz,
  pasta, cebolla, tomate, ajo, pimiento).
- **Nombres de ingredientes** del catálogo canónico existente (el resolver crea
  los que falten, nunca en 'Otros').
- **Campos por receta** (formato de `recipes.json`): `title, description,
  servings, prep_time_min, cook_time_min, calories, tags, allergens (claves),
  diet (claves), ingredients[{name,quantity,unit,substitutions}], steps`.
  `allergens`/`diet`/`meal_types` con vocabulario cerrado; `tags` libres pero
  consistentes (cocina + técnica).
- **Perfil estacional** por receta: la mayoría `all`/varias estaciones para
  platos de todo el año; `confidence: medium`, `source: curated`.

## Lista de títulos propuesta (~50, para revisar)

**Cerdo**: Cerdo con patatas · Lomo de cerdo a la plancha con cebolla · Magro
con tomate · Salchichas frescas con pimientos.
**Pollo**: Pollo al ajillo · Pechuga de pollo a la plancha con limón · Muslos
de pollo al horno con patatas · Arroz con pollo sencillo.
**Ternera**: Ternera guisada con guisantes · Filete de ternera a la plancha ·
Albóndigas en salsa de tomate.
**Huevo**: Tortilla francesa · Huevos fritos con patatas · Huevos rotos con
jamón · Revuelto de setas · Revuelto de ajetes.
**Pescado**: Merluza a la plancha con verduras · Salmón al horno con limón ·
Bacalao con tomate · Sardinas a la plancha · Ensalada de atún · Boquerones
fritos.
**Legumbres**: Lentejas estofadas · Garbanzos con espinacas · Alubias con
chorizo · Potaje de garbanzos · Judías verdes con jamón.
**Arroz y pasta**: Arroz a la cubana · Arroz blanco con tomate · Macarrones con
tomate · Espaguetis al ajillo · Pasta con atún y tomate.
**Verduras**: Pisto de verduras · Menestra de verduras · Verduras al horno ·
Puré de patata · Crema de calabacín · Espinacas rehogadas · Ensalada mixta.
**Sopas**: Sopa de fideos · Sopa de verduras · Gazpacho.
**Desayuno y merienda**: Tostada con tomate y aceite · Tostada de aguacate ·
Yogur con fruta y miel · Tortitas sencillas · Bocadillo de tortilla francesa ·
Pan con chocolate.

(Algunas pueden coincidir con existentes y se deduplicarán; no pasa nada.)

## Entrega

Un PR de datos: `recipes.json` y `recipe-season-profiles.json` ampliados +
sembrado en local. La redacción completa (ingredientes con cantidades, pasos,
tiempos, alérgenos, dieta, meal_types) se hace en la ejecución.

## Verificación

- `node scripts/seed/seed-recipes.mjs` (o el comando pnpm equivalente) siembra
  sin error de emparejamiento receta↔perfil estacional; las nuevas se insertan
  (no todas deduplicadas).
- Consulta: las recetas nuevas existen con `jsonb_array_length(ingredients) ≤ 6`
  y `reusable = true`.
- Escenario clave: con una despensa de prueba que tenga cerdo (dentro de plazo)
  + patata + cebolla, `household_today_decision` devuelve una receta de cerdo
  sencilla como `pantry.featured` en modo `cook_now` o con ≤2 faltantes (antes
  no existía y salía la tortilla).

## No incluye

Personalización por gustos (pieza 4), campo estructurado de cocina, ni
normalización de tags. Solo añade recetas sencillas.
