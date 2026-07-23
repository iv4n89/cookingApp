# Escalar catálogo con dedup — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar de 24 recetas a un catálogo de cientos, generadas por LLM por taxonomía, con dedup por similitud en el servidor y sin coste de imagen upfront.

**Architecture:** Nueva RPC `find_similar_recipe` para el dedup; `index-recipe` embeddea una vez, deduplica y guarda con imagen diferida; un script Node `generate-recipes.mjs` recorre celdas cocina×tipo×dieta pidiendo recetas a Gemini y las POSTea a `index-recipe`.

**Tech Stack:** Postgres/pgvector (migraciones Supabase), Deno (edge functions), Node ESM (script de seed), Gemini (`gemini-flash-lite-latest` + `gemini-embedding-001`).

**Verificación:** El repo no tiene framework de tests. Se verifica con `deno check`, `psql` (transacción + rollback y ejecución real) y smoke tests contra el Supabase local (`http://127.0.0.1:54321`), que es el patrón usado en el resto del proyecto. Conexión DB local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

Spec: `docs/superpowers/specs/2026-07-23-catalog-scale-dedup-design.md`.

---

### Task 1: Migración — RPC `find_similar_recipe`

**Files:**
- Create: `supabase/migrations/0034_find_similar_recipe.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- RPC de deduplicación del catálogo: devuelve la receta reusable más cercana por coseno
-- por encima del umbral (top-1), o nada. La usa index-recipe antes de insertar para no
-- crear near-duplicados. No se reutiliza match_recipes porque esa no filtra por reusable
-- y aplica filtros de alérgenos/dieta.
create function find_similar_recipe(query_embedding vector(768), match_threshold float)
returns table (id uuid, title text, similarity float)
language sql
stable
as $$
  select r.id, r.title, 1 - (r.embedding <=> query_embedding) as similarity
  from recipes r
  where r.reusable
    and r.embedding is not null
    and 1 - (r.embedding <=> query_embedding) >= match_threshold
  order by r.embedding <=> query_embedding
  limit 1;
$$;

grant execute on function find_similar_recipe(vector, float) to service_role;
grant execute on function find_similar_recipe(vector, float) to authenticated;
```

- [ ] **Step 2: Validar la sintaxis en transacción con rollback**

Run:
```bash
DBURL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
{ echo "BEGIN;"; cat supabase/migrations/0034_find_similar_recipe.sql; echo "ROLLBACK;"; } | psql "$DBURL" -v ON_ERROR_STOP=1
```
Expected: `BEGIN`, `CREATE FUNCTION`, `GRANT`, `GRANT`, `ROLLBACK` sin errores.

- [ ] **Step 3: Aplicar en local**

Run: `supabase migration up`
Expected: `Applying migration 0034_find_similar_recipe.sql...` y `Migrations applied`.

- [ ] **Step 4: Verificar que deduplica contra sí misma**

Toma el embedding de una receta existente y comprueba que la RPC la encuentra a similitud ~1.

Run:
```bash
DBURL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
psql "$DBURL" -tA -c "select (find_similar_recipe(r.embedding, 0.9)).title from recipes r where r.embedding is not null limit 1;"
```
Expected: imprime el título de una receta (match consigo misma ≥ 0,9). Si no hay recetas con embedding en local, siembra una antes con el flujo actual.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0034_find_similar_recipe.sql
git commit -m "feat(db): find_similar_recipe para dedup del catálogo"
```

---

### Task 2: `saveRecipe` — embedding precalculado + imagen diferida

**Files:**
- Modify: `supabase/functions/_shared/recipes.ts:237-266` (función `saveRecipe`) y añadir helper `recipeEmbedding` + tipo `SaveOptions`.

- [ ] **Step 1: Exportar `recipeEmbedding` y `SaveOptions`, y extender `saveRecipe`**

Sustituye la función `saveRecipe` actual (empieza en la línea 237) por esto:

```ts
// Embedding representativo de la receta (mismo texto que usa el índice semántico).
export async function recipeEmbedding(recipe: RecipeData): Promise<number[]> {
  return embedText(embeddingText(recipe), 'RETRIEVAL_DOCUMENT');
}

export interface SaveOptions {
  // Reutiliza un embedding ya calculado (evita re-embeddear cuando el llamador ya lo hizo,
  // p. ej. index-recipe para el dedup).
  embedding?: number[];
  // Imagen diferida: image_status='none' aunque sea reusable, y el llamador NO encola imagen.
  // La generación on-demand (ensure-recipe-image) la crea al abrir la receta.
  deferImage?: boolean;
}

export async function saveRecipe(
  supabase: SupabaseClient,
  recipe: RecipeData,
  options: SaveOptions = {},
) {
  const embedding = options.embedding ?? (await recipeEmbedding(recipe));
  const ingredients = await withIngredientIds(supabase, recipe.ingredients ?? []);
  const reusable = recipe.reusable ?? true;
  const imageStatus = options.deferImage ? 'none' : reusable ? 'pending' : 'none';
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      title: recipe.title,
      description: recipe.description ?? '',
      source: recipe.source ?? 'generated',
      source_url: recipe.source_url ?? null,
      image_url: recipe.image_url ?? null,
      servings: recipe.servings ?? 2,
      prep_time_min: recipe.prep_time_min ?? 0,
      cook_time_min: recipe.cook_time_min ?? 0,
      calories: recipe.calories ?? null,
      tags: recipe.tags ?? [],
      allergens: recipe.allergens ?? null,
      diet: recipe.diet ?? null,
      meal_types: recipe.meal_types ?? [],
      ingredients,
      steps: recipe.steps ?? [],
      reusable,
      image_status: imageStatus,
      embedding,
    })
    .select(RETURN_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Typecheck**

Run: `deno check supabase/functions/_shared/recipes.ts`
Expected: `Check ...recipes.ts` y exit 0, sin errores.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/recipes.ts
git commit -m "feat(recipes): saveRecipe admite embedding precalculado e imagen diferida"
```

---

### Task 3: `index-recipe` — dedup + imagen diferida

**Files:**
- Modify: `supabase/functions/index-recipe/index.ts` (reescritura completa del handler).

- [ ] **Step 1: Reescribir `index-recipe/index.ts`**

Sustituye el contenido completo por:

```ts
import { hasInternalSecret } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/db.ts';
import { recipeEmbedding, saveRecipe, type RecipeData } from '../_shared/recipes.ts';

// Umbral de similitud coseno para considerar dos recetas del catálogo el "mismo plato".
const DEDUP_THRESHOLD = Number(Deno.env.get('SEED_DEDUP_THRESHOLD') ?? '0.9');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Endpoint interno (siembra + orquestación de generación): protegido por secreto.
  if (!hasInternalSecret(req)) return json({ error: 'No autorizado.' }, 401);

  const recipe = (await req.json().catch(() => ({}))) as RecipeData;
  if (!recipe?.title) return json({ error: 'Falta el campo "title".' }, 400);

  try {
    const supabase = serviceClient();
    // Embeddea una vez: sirve para el dedup y para guardar (sin re-embeddear).
    const embedding = await recipeEmbedding(recipe);

    const { data: similar, error: simError } = await supabase.rpc('find_similar_recipe', {
      query_embedding: embedding,
      match_threshold: DEDUP_THRESHOLD,
    });
    if (simError) throw simError;
    const existing = similar?.[0];
    if (existing) return json({ deduped: true, recipe: existing });

    // Imagen diferida: no se encola aquí; se genera on-demand al abrir la receta.
    const saved = await saveRecipe(supabase, recipe, { embedding, deferImage: true });
    return json({ deduped: false, recipe: saved });
  } catch (e) {
    console.error('index-recipe:', e);
    return json({ error: 'No se pudo guardar la receta.' }, 500);
  }
});
```

Nota: desaparecen el import y la llamada a `queueRecipeImage` (ya no se encola imagen al sembrar).

- [ ] **Step 2: Typecheck**

Run: `deno check supabase/functions/index-recipe/index.ts`
Expected: exit 0, sin errores.

- [ ] **Step 3: Reiniciar el edge runtime local para recargar**

Run: `docker restart supabase_edge_runtime_recetasApp`
Expected: imprime el nombre del contenedor; queda `Up`.

- [ ] **Step 4: Smoke test — sembrar una receta y comprobar dedup + image_status**

Primera inserción (deduped:false) y segunda idéntica (deduped:true). Usa el secreto interno de `supabase status`.

Run:
```bash
SECRET=$(supabase status -o env 2>/dev/null | grep -i INTERNAL_FUNCTION_SECRET | cut -d= -f2- | tr -d '"')
ANON=$(supabase status -o env 2>/dev/null | grep -iE 'ANON_KEY' | head -1 | cut -d= -f2- | tr -d '"')
BODY='{"title":"Prueba dedup zzz","description":"receta de prueba","servings":2,"tags":["test"],"allergens":[],"diet":["vegan","vegetarian"],"meal_types":["cena"],"ingredients":[{"name":"Tomate","quantity":2,"unit":"ud","substitutions":[]}],"steps":[{"order":1,"instruction":"Mezclar.","timerSeconds":null}]}'
URL="http://127.0.0.1:54321/functions/v1/index-recipe"
echo "== 1ª =="; curl -s -X POST "$URL" -H "Content-Type: application/json" -H "Authorization: Bearer $ANON" -H "x-internal-secret: $SECRET" -d "$BODY"
echo; echo "== 2ª (idéntica) =="; curl -s -X POST "$URL" -H "Content-Type: application/json" -H "Authorization: Bearer $ANON" -H "x-internal-secret: $SECRET" -d "$BODY"
```
Expected: la 1ª responde `"deduped":false` con la receta; la 2ª responde `"deduped":true`.

- [ ] **Step 5: Comprobar image_status='none' de la sembrada**

Run:
```bash
DBURL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
psql "$DBURL" -tA -c "select image_status from recipes where title='Prueba dedup zzz';"
```
Expected: `none`.

- [ ] **Step 6: Limpiar la receta de prueba**

Run:
```bash
DBURL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
psql "$DBURL" -c "delete from recipes where title='Prueba dedup zzz';"
```
Expected: `DELETE 1`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/index-recipe/index.ts
git commit -m "feat(index-recipe): dedup por similitud e imagen diferida al sembrar"
```

---

### Task 4: Script de generación por taxonomía

**Files:**
- Create: `scripts/seed/generate-recipes.mjs`

- [ ] **Step 1: Escribir el script**

```js
// Genera un catálogo de recetas por taxonomía (cocina × tipo de comida × dieta) con Gemini
// y las siembra vía la función interna `index-recipe` (que embeddea, deduplica y guarda).
// Re-ejecutable: el dedup del servidor hace seguro correrlo varias veces.
//
// Uso:
//   GEMINI_API_KEY=<key> \
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_ANON_KEY=<anon> \
//   INTERNAL_FUNCTION_SECRET=<secreto> \
//   [RECIPES_PER_CELL=3] [CUISINES="española,italiana"] \
//   node scripts/seed/generate-recipes.mjs

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const base = process.env.SUPABASE_FUNCTIONS_URL ?? `${process.env.SUPABASE_URL ?? ''}/functions/v1`;
const anonKey = process.env.SUPABASE_ANON_KEY;
const secret = process.env.INTERNAL_FUNCTION_SECRET;
const perCell = Number(process.env.RECIPES_PER_CELL ?? '3');

if (!GEMINI_KEY) { console.error('Falta GEMINI_API_KEY.'); process.exit(1); }
if (!process.env.SUPABASE_URL && !process.env.SUPABASE_FUNCTIONS_URL) {
  console.error('Falta SUPABASE_URL (o SUPABASE_FUNCTIONS_URL).'); process.exit(1);
}
if (!anonKey || !secret) { console.error('Faltan SUPABASE_ANON_KEY y/o INTERNAL_FUNCTION_SECRET.'); process.exit(1); }

const GEN_MODEL = 'gemini-flash-lite-latest';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const CUISINES = (process.env.CUISINES ?? [
  'española', 'italiana', 'mexicana', 'japonesa', 'india', 'tailandesa',
  'griega', 'francesa', 'china', 'marroquí', 'peruana', 'estadounidense',
].join(',')).split(',').map((c) => c.trim()).filter(Boolean);
const MEAL_TYPES = ['desayuno', 'almuerzo', 'merienda', 'cena'];
const DIETS = ['omnívora', 'vegetariana', 'vegana'];

const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    description: { type: 'STRING' },
    servings: { type: 'INTEGER' },
    prep_time_min: { type: 'INTEGER' },
    cook_time_min: { type: 'INTEGER' },
    calories: { type: 'INTEGER' },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    allergens: { type: 'ARRAY', items: { type: 'STRING' } },
    diet: { type: 'ARRAY', items: { type: 'STRING' } },
    meal_types: { type: 'ARRAY', items: { type: 'STRING' } },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, quantity: { type: 'STRING' }, unit: { type: 'STRING' } },
        required: ['name'],
      },
    },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { instruction: { type: 'STRING' }, timer_seconds: { type: 'INTEGER' } },
        required: ['instruction'],
      },
    },
  },
  required: ['title', 'description', 'servings', 'prep_time_min', 'cook_time_min', 'tags', 'allergens', 'diet', 'meal_types', 'ingredients', 'steps'],
};

const BATCH_SCHEMA = {
  type: 'OBJECT',
  properties: { recipes: { type: 'ARRAY', items: RECIPE_SCHEMA } },
  required: ['recipes'],
};

function dietText(diet) {
  if (diet === 'vegana') return 'TODAS deben ser veganas (sin ingredientes de origen animal).';
  if (diet === 'vegetariana') return 'TODAS deben ser vegetarianas (sin carne ni pescado).';
  return 'Pueden incluir carne o pescado.';
}

async function generateCell(cuisine, mealType, diet, n) {
  const prompt =
    `Eres un chef profesional. Crea ${n} recetas DISTINTAS entre sí, realistas y en español, de cocina ` +
    `${cuisine}, pensadas para ${mealType}. ${dietText(diet)} Evita platos genéricos repetidos; busca variedad ` +
    `real (técnicas, ingredientes principales y regiones distintas). Para cada receta usa cantidades concretas, ` +
    `pasos claros y numerados, tiempos y calorías aproximadas, y etiquetas útiles. Añade timer_seconds solo en ` +
    `los pasos con espera o cocción. En "allergens" incluye SOLO las claves de esta lista que la receta contenga ` +
    `realmente: gluten, crustaceans, molluscs, egg, fish, peanut, soy, milk, nuts, celery, mustard, sesame, ` +
    `fructose, histamine, sorbitol, pork, alcohol (vacío si ninguno). En "diet" incluye "vegetarian" si es ` +
    `vegetariana y "vegan" si es vegana (una vegana es también vegetariana: incluye ambas). En "meal_types" usa ` +
    `SOLO estas claves (una receta puede valer para varias) e incluye "${mealType}": desayuno, almuerzo, merienda, cena.`;

  const res = await fetch(`${GEMINI_BASE}/models/${GEN_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: BATCH_SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Respuesta de generación inesperada de Gemini');
  return JSON.parse(text).recipes ?? [];
}

function parseQuantity(value) {
  if (!value) return null;
  const n = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

// Mapea la receta de Gemini a la forma de dominio que espera index-recipe/saveRecipe
// (espejo de recipeFromGenerated en _shared/recipes.ts).
function toRecipeData(g) {
  return {
    title: g.title,
    description: g.description ?? '',
    source: 'generated',
    source_url: null,
    servings: g.servings,
    prep_time_min: g.prep_time_min,
    cook_time_min: g.cook_time_min,
    calories: g.calories ?? null,
    tags: g.tags ?? [],
    allergens: g.allergens ?? [],
    diet: g.diet ?? [],
    meal_types: g.meal_types ?? [],
    ingredients: (g.ingredients ?? []).map((i) => ({
      name: i.name,
      quantity: parseQuantity(i.quantity),
      unit: (i.unit ?? '').trim() || null,
      substitutions: [],
    })),
    steps: (g.steps ?? []).map((s, index) => ({
      order: index + 1,
      instruction: s.instruction,
      timerSeconds: typeof s.timer_seconds === 'number' && s.timer_seconds > 0 ? s.timer_seconds : null,
    })),
  };
}

async function seed(recipe) {
  const res = await fetch(`${base}/index-recipe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      'x-internal-secret': secret,
    },
    body: JSON.stringify(recipe),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

let ok = 0, dup = 0, failed = 0;
for (const cuisine of CUISINES) {
  for (const mealType of MEAL_TYPES) {
    for (const diet of DIETS) {
      let recipes = [];
      try {
        recipes = await generateCell(cuisine, mealType, diet, perCell);
      } catch (e) {
        console.error(`GEN XX ${cuisine}/${mealType}/${diet} -> ${e.message}`);
        continue;
      }
      for (const g of recipes) {
        try {
          const result = await seed(toRecipeData(g));
          if (result.deduped) { dup++; console.log(`DUP ${g.title}`); }
          else { ok++; console.log(`OK  ${g.title} [${cuisine}/${mealType}/${diet}]`); }
        } catch (e) {
          failed++;
          console.error(`XX  ${g.title} -> ${e.message}`);
        }
      }
    }
  }
}

console.log(`\n${ok} nuevas, ${dup} duplicadas, ${failed} fallidas.`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Sintaxis del script**

Run: `node --check scripts/seed/generate-recipes.mjs`
Expected: sin salida y exit 0 (sintaxis válida).

- [ ] **Step 3: Smoke run de una tanda mínima contra local**

Limita a una sola cocina y pocas por celda para no gastar. Requiere `GEMINI_API_KEY` en el entorno.

Run:
```bash
SECRET=$(supabase status -o env 2>/dev/null | grep -i INTERNAL_FUNCTION_SECRET | cut -d= -f2- | tr -d '"')
ANON=$(supabase status -o env 2>/dev/null | grep -iE 'ANON_KEY' | head -1 | cut -d= -f2- | tr -d '"')
GEMINI_API_KEY="$GEMINI_API_KEY" SUPABASE_URL="http://127.0.0.1:54321" \
  SUPABASE_ANON_KEY="$ANON" INTERNAL_FUNCTION_SECRET="$SECRET" \
  CUISINES="española" RECIPES_PER_CELL=1 \
  node scripts/seed/generate-recipes.mjs
```
Expected: líneas `OK ...` con recetas variadas (una por celda desayuno/almuerzo/merienda/cena × omnívora/vegetariana/vegana) y un resumen final. Correr una 2ª vez debería producir varias `DUP`.

- [ ] **Step 4: Verificar meal_types en las nuevas recetas**

Run:
```bash
DBURL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
psql "$DBURL" -tA -c "select title, meal_types from recipes where meal_types <> '{}' order by created_at desc limit 5;"
```
Expected: filas con `meal_types` no vacío (p. ej. `{cena}`, `{almuerzo,cena}`).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed/generate-recipes.mjs
git commit -m "feat(seed): generación de catálogo por taxonomía cocina×tipo×dieta"
```

---

### Task 5: Nota en el runner de seed existente

**Files:**
- Modify: `scripts/seed/seed-recipes.mjs:10` (comentario sobre dedup).

- [ ] **Step 1: Actualizar el comentario sobre dedup**

El comentario actual dice "no hay deduplicación; ejecutarlo dos veces inserta las recetas repetidas". Ya no es cierto (el dedup vive en `index-recipe`). Sustituye la línea 10:

```js
// Nota: el dedup vive en index-recipe (find_similar_recipe); re-ejecutar es seguro y no duplica.
```

- [ ] **Step 2: Commit**

```bash
git add scripts/seed/seed-recipes.mjs
git commit -m "docs(seed): el dedup ahora es del servidor, re-ejecutar es seguro"
```

---

## Cierre

- [ ] Abrir PR a `main` con `gh pr create` (rama `feat/catalog-scale-dedup`).
- [ ] Lanzar el agente revisor sobre el diff (flujo del repo).
- [ ] Mergear solo si la revisión pasa sin hallazgos relevantes (pedir confirmación).

Despliegue tras merge: aplicar `0034` y redesplegar `index-recipe` (en local: `supabase migration up` + `docker restart supabase_edge_runtime_recetasApp`). El sembrado masivo se lanza a mano con `generate-recipes.mjs` cuando se quiera crecer el catálogo.
