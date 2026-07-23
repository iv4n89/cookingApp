# Escalar catálogo de recetas con dedup — diseño

Fecha: 2026-07-23

## Objetivo

Pasar de 24 recetas sembradas a mano a un catálogo de **cientos de recetas** generadas
por LLM, de forma **incremental y re-ejecutable**, sin insertar duplicados y sin coste de
imagen por adelantado.

Decisiones tomadas (brainstorming 23-jul):

- **Origen**: LLM en lote offline (Gemini), coherente con la decisión de producto (platos
  reales del LLM, sin web ni atribución). Ver [[recetasapp-web-attribution-decision]].
- **Dedup**: en el servidor (`index-recipe`), no en el script. Protege cualquier vía de
  sembrado. Umbral de similitud coseno ~0,9 (mismo criterio que el dedup de
  `recommended_recipes`).
- **Imágenes**: on-demand. El sembrado no encola imagen; se genera al abrir la receta
  (`ensure-recipe-image`, #81). Coherente con la línea de coste.
- **Escala**: cientos (~200-500), en tandas re-ejecutables.
- **Cobertura**: taxonomía **cocina × tipo de comida × dieta** para cubrir el espacio y
  evitar que el LLM repita los platos populares.

## Estado actual (punto de partida)

- `scripts/seed/recipes.json`: 24 recetas a mano. `scripts/seed/seed-recipes.mjs` las
  POSTea a `index-recipe`. Sin dedup (correr dos veces duplica).
- `index-recipe` (`supabase/functions/index-recipe/index.ts`): endpoint interno
  (protegido por `INTERNAL_FUNCTION_SECRET`). Llama a `saveRecipe` y **encola imagen fal**
  vía `queueRecipeImage`.
- `saveRecipe` (`_shared/recipes.ts`): calcula embedding (`embedText`), resuelve
  ingredientes al catálogo, inserta. Fija `image_status = reusable ? 'pending' : 'none'`.
  No comprueba duplicados.
- Dedup existente: solo en tiempo de consulta (`recommended_recipes`, umbral 0,9) y la
  reutilización de caché de `match_recipes` (umbral 0,65). Ninguno evita insertar un
  near-duplicado en el catálogo.
- `ensure-recipe-image`: genera on-demand si la receta no tiene imagen. **Clave**: si
  `image_status === 'pending'` no hace nada (asume job en vuelo); solo genera cuando el
  estado NO es 'pending' y no hay `image_url`.
- Las 24 recetas actuales **no** llevan `meal_types` (`recommended_recipes` los usa para el
  slot de Home; sin ellos el `slot_match` casi nunca acierta).

## Diseño

Tres piezas.

### 1. Dedup en el servidor + imagen diferida

**Nueva RPC `find_similar_recipe(query_embedding vector(768), match_threshold float)`**
(migración nueva). Devuelve la receta **reusable** más cercana por coseno con
`similarity >= match_threshold` (top-1), o vacío. No se reutiliza `match_recipes` porque
esa no filtra por `reusable` y aplica filtros de alérgenos/dieta.

```sql
create function find_similar_recipe(query_embedding vector(768), match_threshold float)
returns table (id uuid, title text, similarity float)
language sql stable as $$
  select r.id, r.title, 1 - (r.embedding <=> query_embedding) as similarity
  from recipes r
  where r.reusable and r.embedding is not null
    and 1 - (r.embedding <=> query_embedding) >= match_threshold
  order by r.embedding <=> query_embedding
  limit 1;
$$;
```

**`saveRecipe`** acepta:
- Un `embedding` precalculado opcional (evita el doble embed: `index-recipe` embeddea para
  el dedup y reutiliza el mismo vector al guardar).
- Un modo "imagen diferida": cuando está activo, `image_status = 'none'` y el llamador no
  encola imagen. Así `ensure-recipe-image` sí generará al abrir (estado ≠ 'pending').

**`index-recipe`**:
1. Embeddea el texto de la receta una vez.
2. Llama `find_similar_recipe(embedding, 0.9)`. Si hay match → responde
   `{ deduped: true, recipe: <existente> }` sin insertar.
3. Si no → `saveRecipe` con el embedding precalculado y modo imagen diferida. **No** encola
   imagen. Responde `{ deduped: false, recipe: <nueva> }`.

Umbral de dedup configurable por env (`SEED_DEDUP_THRESHOLD`, default 0,9).

Esto no toca la generación del chat/búsqueda (`resolveRecipe` sigue igual: su dedup natural
es `match_recipes` a 0,65 antes de generar, y encola su propia imagen para reutilizables).

### 2. Script de generación por taxonomía (offline, Node)

Nuevo `scripts/seed/generate-recipes.mjs`:

- Recorre celdas de la taxonomía: **cocina × tipo de comida × dieta**.
  - Cocinas: lista fija (p. ej. española, italiana, mexicana, japonesa, india, tailandesa,
    griega, francesa, china, marroquí, peruana, estadounidense…). Configurable.
  - Tipos de comida: `MEAL_TYPE_KEYS` (desayuno, almuerzo, merienda, cena).
  - Dietas: omnívora, vegetariana, vegana.
- Por celda, pide a Gemini (flash) **N recetas** (default pequeño, p. ej. 3) con un
  `responseSchema` que incluye `title`, `description`, `servings`, tiempos, `calories`,
  `tags`, `allergens`, `diet`, **`meal_types`**, `ingredients`, `steps`.
- POSTea cada receta a `index-recipe` (que embeddea, deduplica y guarda).
- Registra por receta: `OK`, `DUP` (deduped) o `XX` (fallo). Resumen al final.
- Throttling: secuencial o concurrencia baja para respetar rate limits de Gemini.
- Re-ejecutable: el dedup del servidor hace seguro correrlo varias veces; cada corrida
  suma variedad sin duplicar.

El script genera con Gemini directamente (Node `fetch` a la API), no reutiliza el helper
Deno `_shared/gemini.ts`. Debe pedir explícitamente `meal_types` acordes a la celda.

Variables de entorno: `GEMINI_API_KEY`, `SUPABASE_URL` (o `SUPABASE_FUNCTIONS_URL`),
`SUPABASE_ANON_KEY`, `INTERNAL_FUNCTION_SECRET`. Parámetros opcionales:
`RECIPES_PER_CELL`, `SEED_DEDUP_THRESHOLD`.

### 3. Coste y límites

- Generación con Gemini flash (barato); embeddings en free-tier. Sin coste de imagen
  upfront (on-demand).
- El dedup evita gastar en recetas repetidas (embedding + inserción).
- Objetivo inicial cientos, incremental.

## Fuera de alcance

- Backfill de `meal_types` y de imágenes para las 24 recetas viejas.
- Dedup entre recetas ya existentes en el catálogo (solo se deduplica al insertar).
- Cambiar el flujo de imágenes del chat/búsqueda (siguen encolando su imagen como hoy).

## Verificación

- Migración de la RPC validada en local (transacción + rollback y ejecución real).
- `index-recipe`: sembrar dos veces la misma tanda → la segunda responde `deduped: true`
  para todas; el catálogo no crece.
- Receta sembrada: `image_status = 'none'`, sin imagen; al abrir el detalle,
  `ensure-recipe-image` la genera (estado pasa a 'pending' → 'ready').
- Script: una tanda de prueba (pocas celdas) produce recetas variadas con `meal_types`.

Relacionado: [[recetasapp-todo-2026-07-22]], [[recetasapp-ai-behavior]],
[[recetasapp-canonical-ingredients]].
