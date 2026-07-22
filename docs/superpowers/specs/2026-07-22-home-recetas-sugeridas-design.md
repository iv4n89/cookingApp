# Recetas sugeridas de la Home — diseño

Fecha: 2026-07-22

## Objetivo

Mejorar la sección "Para tu despensa" de la Home para que las recetas sugeridas:

- Usen solo ingredientes que ya tenemos, admitiendo que falten como mucho 1-2 (sin
  contar staples de despensa fija).
- Respeten las preferencias del usuario (alérgenos excluidos, dieta requerida).
- Tengan un fallback por preferencias cuando la despensa esté vacía o casi.
- Se puedan refrescar con pull-to-refresh para ver nuevas.
- Cambien según el momento del día: desayuno, almuerzo, merienda, cena.

La variedad (dedup por similitud de embeddings) ya existe en la RPC actual y se mantiene.

## Estado actual (punto de partida)

- La sección "Para tu despensa" (`apps/mobile/src/app/(tabs)/index.tsx`) renderiza
  `HomeSuggestions`, alimentado por `use-home.ts` → `recommendedRecipes()`
  (`lib/recipes.ts`) → RPC Postgres `recommended_recipes(p_limit)`
  (`supabase/migrations/0018_recommended_dedup.sql`).
- La RPC ordena por nº de ingredientes de la receta que coinciden con la despensa
  (`ingredient_id`), filtra `reusable = true` y aplica dedup por embedding (>0.9).
  No exige tener todos los ingredientes, no aplica preferencias, no tiene noción de
  franja horaria y no hay fallback ni refresco manual.
- Preferencias: `user_preferences` (alérgenos/dieta), ya consumidas por `match_recipes`
  en el flujo de búsqueda IA (patrón `exclude_allergens` / `require_diet`).
- No existe flag `purchasable` en `ingredients`; sí categorías controladas.

## Decisiones tomadas

- **Match despensa:** "casi completo" — se admiten recetas a las que falten <=2
  ingredientes (staples no cuentan como faltantes).
- **Franjas:** columna `meal_types text[]` en `recipes` (una receta puede valer para
  varias franjas).
- **Clasificación:** IA (Gemini) en el pipeline de generación + backfill del pool
  actual con un script one-off que clasifica con Gemini.
- **Refresco:** pull-to-refresh estilo Chrome Android (flecha circular) + rotación
  automática por franja horaria. Sin temporizador de auto-rotación.
- **Fallback:** cuando la despensa no llena el cupo, completar con recetas del pool
  existente filtradas por preferencias + franja (sin IA en carga).

## Modelo de datos

Nueva migración:

- `alter table recipes add column meal_types text[]` con default `'{}'`.
- Valores del set fijo: `desayuno`, `almuerzo`, `merienda`, `cena`.
- Índice GIN: `create index recipes_meal_types_idx on recipes using gin (meal_types)`.

## Clasificación de franjas (meal_types)

### Pipeline (recetas nuevas)

- Añadir `meal_types` al schema/prompt de generación de recetas en
  `supabase/functions/_shared/` (junto a `allergens`/`diet`, que ya salen de la IA).
- La IA devuelve el array de franjas para cada receta.
- `index-recipe` persiste `meal_types` al insertar/actualizar la receta.

### Backfill (pool actual)

- Script one-off en `scripts/` que:
  1. Selecciona recetas con `meal_types` vacío.
  2. Las clasifica con Gemini por lotes (título + descripción + tags).
  3. Actualiza `recipes.meal_types`.
- Coste único; no se ejecuta en runtime.

## RPC `recommended_recipes` v2

Nueva migración que reemplaza la función. Firma ampliada:

```
recommended_recipes(
  p_limit int default 6,
  p_meal_type text default null,
  p_exclude uuid[] default '{}'
)
```

- `security invoker`; las preferencias se leen en servidor desde `user_preferences`
  filtrando por `auth.uid()` (alérgenos desde `special_needs`, dieta según el mapeo
  existente en `_shared/preferences.ts`), igual que hace el flujo de búsqueda.
- **Staples** (no cuentan como ingrediente faltante): ingredientes cuyas categorías
  son `Especias y hierbas`, `Condimentos y edulcorantes`, `Aceites, vinagres y salsas`.
  Se asumen siempre disponibles en casa.

### Lógica en dos pasadas

**Pasada A — despensa (casi completo):**

- Por receta, contar ingredientes que NO están en la despensa del usuario y que no son
  staples → `missing_count`. Contar los que sí están → `match_count`.
- Filtros duros: `reusable = true`; `meal_types @> array[p_meal_type]` (si
  `p_meal_type` no es null); alérgenos excluidos (`not (allergens && exclude_allergens)`);
  dieta requerida (`diet @> require_diet`); `id` no en `p_exclude`; `missing_count <= 2`.
- Orden: `missing_count` asc, luego dedup de variedad por embedding (similitud coseno
  > 0.9 descarta), luego recencia (`created_at` desc).

**Pasada B — fallback por preferencias:**

- Si la pasada A devuelve menos de `p_limit`, completar el resto con recetas del pool
  filtradas solo por preferencias + `meal_types` (ignorando la despensa), excluyendo las
  ya elegidas en A y las de `p_exclude`, con el mismo dedup por variedad.
- `missing_count` en estos casos refleja el número real de ingredientes que no se tienen
  (puede ser > 2).

### Retorno

Las filas incluyen al menos: los campos actuales de la receta usados por la tarjeta,
`match_count` y `missing_count`.

## Cliente

### `use-home.ts`

- Calcular la franja actual (`mealType`) desde la hora local del dispositivo (ver
  tabla de franjas).
- Pasar `mealType` y la lista de exclusión a `recommendedRecipes`.
- Mantener en estado (solo sesión, sin persistencia) `seenIds`: los ids ya mostrados,
  para la rotación.
- El cambio de franja resetea `seenIds`.

### Rotación / pull-to-refresh

- La lista se envuelve en un contenedor con `RefreshControl` (flecha circular, gesto de
  tirar hacia abajo).
- Al refrescar: refetch con `p_exclude = seenIds`; los nuevos ids se añaden a `seenIds`.
- Si la RPC devuelve menos de `limit` (candidatos agotados): resetear `seenIds` y volver
  a pedir frescas.

### `lib/recipes.ts`

- Ampliar la firma de `recommendedRecipes(limit, mealType, exclude)` y pasar los nuevos
  parámetros a `supabase.rpc('recommended_recipes', ...)`.

### Presentación

- Saludo dinámico por franja en lugar del texto fijo "Buenos días, chef":
  - 05–11:59 → "Buenos días"
  - 12–19:59 → "Buenas tardes"
  - 20–04:59 → "Buenas noches"
- Título de sección tipo "Ideas para tu {franja}" (desayuno/almuerzo/merienda/cena).
- Badge de tarjeta según `missing_count`:
  - `0` → "LISTA PARA COCINAR"
  - `> 0` → "TE FALTAN {n}"

## Franjas horarias

| Franja    | Rango horario (local) |
|-----------|-----------------------|
| desayuno  | 05:00 – 11:59         |
| almuerzo  | 12:00 – 16:59         |
| merienda  | 17:00 – 19:59         |
| cena      | 20:00 – 04:59         |

## Fuera de alcance (YAGNI)

- No persistir los ids ya vistos entre sesiones.
- No auto-rotar por temporizador (la rotación es por franja + pull manual).
- No generar recetas con IA en la carga de la Home (el fallback usa el pool existente).
- No reordenar ni tocar el flujo de búsqueda/chat con IA.
