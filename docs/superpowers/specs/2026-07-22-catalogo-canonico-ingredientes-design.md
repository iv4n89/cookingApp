# Catálogo canónico de ingredientes (match despensa↔recetas) — diseño

Fecha: 2026-07-22

## Problema

El match entre la despensa del usuario y los ingredientes de las recetas está roto por un
catálogo de ingredientes partido en dos "espacios de nombres":

- El catálogo tiene **442** ingredientes, **111 en la categoría "Otros"** (25%).
- Las recetas referencian ingredientes genéricos ("Cebolla", "Tomate", "Harina",
  "atún en aceite de oliva"…) que el pipeline creó automáticamente en "Otros".
- La despensa usa las entradas **controladas** ("Cebolla blanca", "Tomate rama",
  "Harina de trigo", "Atún en conserva"…), con `id` distinto.
- **64%** de las referencias de ingredientes de las recetas (198 de 308) apuntan a "Otros".

Resultado: aunque el usuario tenga cebolla, tomate, patata, pollo…, no cuentan como match
porque receta y despensa apuntan a filas distintas del catálogo. La mejor receta solo casa
3 de sus 10 ingredientes. La sección "cocinable con lo que tengo" sale casi vacía.

Diagnóstico confirmado: no es un bug de las sugeridas ni un pool pequeño; no hay duplicados
por `normalized_name` exacto (los nombres difieren en granularidad, p.ej. "cebolla" vs
"cebolla blanca"). El origen es `withIngredientIds` en `supabase/functions/_shared/recipes.ts`:
al guardar una receta, si el nombre del ingrediente no casa exacto con el catálogo, crea una
entrada nueva en "Otros" en vez de mapear a la controlada.

## Objetivo

Que la despensa case con las recetas resolviendo los ingredientes a un **canónico** común,
sin depender del `id` concreto de cada fila del catálogo.

## Alcance de este spec

Modelo canónico (esquema) + migración de agrupación (datos) + match a nivel canónico en los
tres sitios que comparan ingredientes: sugeridas, auto-descuento al cocinar y lista de compra.

Fuera de alcance (specs aparte):
- Endurecer el pipeline de generación para que no vuelva a crear entradas "Otros".
- Limpiar el picker (ocultar duplicados, reclasificar "Otros" a su categoría fina).
- Tabla de alias **por nombre**: se siembra desde el mapeo de este spec, pero su consumo
  (resolución de nombres en la ingestión) pertenece al spec del pipeline.

## Decisiones tomadas

- **Modelo:** canónico + alias. Un ingrediente canónico por concepto; variantes y genéricos
  se resuelven hacia él.
- **Agrupación:** IA (Gemini) + revisión humana de un fichero de mapeo antes de aplicar.
- **Mapeo:** fichero **JSON versionado en el repo** (revisable en git).
- **Resolución:** todo por `canon` (`coalesce(canonical_id, id)`); **no** se re-apuntan los
  `ingredient_id` existentes de recetas ni de despensa.

## Modelo (esquema)

- Nueva columna `ingredients.canonical_id uuid references ingredients(id)` (auto-referencia).
  - Un ingrediente **canónico** tiene `canonical_id = null` (es su propio canónico).
  - Una variante/genérico apunta a su canónico.
- Índice: `create index ingredients_canonical_id_idx on ingredients (canonical_id)`.
- Regla de resolución: `canon(x) = coalesce(x.canonical_id, x.id)`. Dos ingredientes casan
  si `canon(a) = canon(b)`.
- Función SQL de conveniencia: `ingredient_canonical(p_id uuid) returns uuid` (o `canon`
  inline vía join). Centraliza la resolución para los tres sitios de match.

## Construcción del mapeo (IA + revisión)

Script one-off en `scripts/` (dos pasos, ambos versionados):

1. **Generar** (`scripts/canonicalize/build-mapping.mjs`):
   - Lee los 442 ingredientes (`id, name, category`).
   - Con Gemini (rate-limited como `scripts/backfill-meal-types.mjs`: pausa + reintento en
     429), asigna a cada ingrediente su **grupo canónico**: nombre canónico del concepto y
     qué entrada del catálogo es el canónico del grupo.
   - Escribe `scripts/canonicalize/mapping.json`:
     `[{ id, name, category, canonical_name, canonical_id }]`.
   - El usuario revisa/ajusta el JSON en git antes de aplicar.

2. **Aplicar** (`scripts/canonicalize/apply-mapping.mjs`):
   - Lee `mapping.json` y setea `ingredients.canonical_id`: el canónico de cada grupo con
     `canonical_id = null`; el resto apuntando a él.
   - Idempotente (re-ejecutable sin duplicar efectos).

### Elección del canónico por grupo

- Se prefiere como canónico una entrada de categoría **controlada** (no "Otros").
- Si el grupo solo tiene entradas "Otros", esa es el canónico. (Reclasificar su categoría
  fina se deja para el spec del picker; no afecta al match.)

## Match a nivel canónico (tres sitios)

Todos comparan por `canon` en vez de por `ingredient_id` directo:

1. **Sugeridas** — `recommended_recipes` (nueva migración que reescribe la vigente de la
   rama de la Home): las CTE `pantry` y `staple` y el `ingredient_id` de la receta se
   resuelven a `canon` antes de comparar. Un ingrediente de receta cuenta como "en despensa"
   si `canon(recipe_iid) ∈ { canon(pantry_iid) }`; staple si `canon(recipe_iid) ∈
   { canon(staple_id) }`.
2. **Auto-descuento al cocinar** — la lógica de `cooked_recipes` (migración 0009): al cocinar,
   descuenta de la despensa el ítem cuyo `canon` coincide con el `canon` del ingrediente de
   la receta (no solo `ingredient_id` exacto).
3. **Lista de compra** — al añadir "lo que falta" de una receta, excluir los ingredientes
   cuyo `canon` ya está en la despensa (evita añadir a la compra algo que sí tienes en otra
   variante).

## Despensa sin cambios

La despensa mantiene la variante que eligió el usuario ("Cebolla blanca"); el match sube a
canónico. No se migran datos de `pantry_items`.

## Dependencia y ramas

El cambio del match de `recommended_recipes` se apoya en la versión creada por la rama de la
Home (`feat/home-recetas-sugeridas`, PR #69). Esta iniciativa va apilada sobre ella
(`feat/catalogo-canonico`); su PR debe mergear después del PR #69.

## Verificación

- Migración de esquema aplicada; `canonical_id` presente e indexado.
- `mapping.json` generado y revisado; `apply-mapping` setea `canonical_id` sin dejar grupos
  huérfanos.
- Tras aplicar: repetir el diagnóstico para el usuario de prueba (23 items de despensa) y
  comprobar que suben las recetas cocinables (match ≥1 real → varias con `missing <= 1`).
- Auto-descuento y compra: cocinar/consultar una receta y ver que descuenta/excluye por
  canónico.
