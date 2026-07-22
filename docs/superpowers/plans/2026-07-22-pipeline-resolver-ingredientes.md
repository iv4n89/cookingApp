# Resolver de ingredientes al guardar (sin 'Otros') — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que al guardar una receta cada ingrediente se resuelva al catálogo canónico existente (vía IA), creando los genuinamente nuevos bien categorizados y como su propio canónico, sin volver a crear entradas en 'Otros'.

**Architecture:** Se añade una función `resolveIngredients` (Gemini, salida estructurada) que mapea los nombres de ingrediente de una receta a un `canonical_name` del vocabulario del catálogo + una `category` controlada. `withIngredientIds` se reescribe para usarla: mapea `canonical_name → id` por `normalized_name`, crea los nuevos con categoría controlada y `canonical_id = null`, y elimina la rama que creaba 'Otros'. Fast-path por match exacto y fallback ante fallo de IA.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), Gemini (`gemini-flash-lite-latest`).

**Rama:** `feat/pipeline-resolver-ingredientes` (desde `main`, que ya tiene el modelo canónico mergeado).

**Sin infra de tests:** verificación con `deno check` y una prueba e2e (generar una receta y comprobar la BD).

---

## File Structure

**Modificar:**
- `supabase/functions/_shared/preferences.ts` — añadir `CATALOG_CATEGORIES` (categorías controladas).
- `supabase/functions/_shared/gemini.ts` — añadir `resolveIngredients` + su tipo y schema.
- `supabase/functions/_shared/recipes.ts` — reescribir `withIngredientIds`; importar lo nuevo.

Ningún cambio de esquema ni de otras funciones.

---

## Task 1: Categorías controladas del catálogo

**Files:**
- Modify: `supabase/functions/_shared/preferences.ts`

- [ ] **Step 1: Añadir la constante**

Al final de `supabase/functions/_shared/preferences.ts`, añade:

```ts
// Categorías controladas del catálogo de ingredientes (el seed 0007). El resolver del
// pipeline solo puede asignar una de estas; nunca 'Otros'.
export const CATALOG_CATEGORIES = [
  'Aceites, vinagres y salsas',
  'Carnes',
  'Cereales, pan y pasta',
  'Condimentos y edulcorantes',
  'Conservas y otros',
  'Especias y hierbas',
  'Frutas',
  'Frutos secos y semillas',
  'Lácteos y huevos',
  'Legumbres',
  'Pescados y mariscos',
  'Verduras y hortalizas',
];
```

- [ ] **Step 2: Verificar tipos (Deno)**

Run: `deno check supabase/functions/_shared/preferences.ts`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/preferences.ts
git commit -m "feat(ai): categorías controladas del catálogo (CATALOG_CATEGORIES)"
```

---

## Task 2: Función IA `resolveIngredients`

**Files:**
- Modify: `supabase/functions/_shared/gemini.ts`

- [ ] **Step 1: Importar las categorías**

En `supabase/functions/_shared/gemini.ts`, tras la línea `import { fetchWithTimeout } from './http.ts';`, añade:

```ts
import { CATALOG_CATEGORIES } from './preferences.ts';
```

- [ ] **Step 2: Añadir el tipo, el schema y la función**

Al final de `supabase/functions/_shared/gemini.ts`, añade:

```ts
export interface ResolvedIngredient {
  input: string; // nombre tal cual lo generó la receta
  canonical_name: string; // concepto base, reutilizando el vocabulario del catálogo
  category: string; // una de CATALOG_CATEGORIES
}

const RESOLVE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          input: { type: 'STRING' },
          canonical_name: { type: 'STRING' },
          category: { type: 'STRING' },
        },
        required: ['input', 'canonical_name', 'category'],
      },
    },
  },
  required: ['items'],
};

// Mapea cada nombre de ingrediente de una receta a un concepto canónico del catálogo (o a uno
// nuevo bien categorizado). El servidor luego resuelve canonical_name -> id por nombre; el LLM
// nunca devuelve UUIDs.
export async function resolveIngredients(
  names: string[],
  canonicals: { name: string; category: string }[],
): Promise<ResolvedIngredient[]> {
  const vocab = canonicals.map((c) => `- ${c.name} (${c.category})`).join('\n');
  const prompt =
    `Eres un normalizador de ingredientes de cocina. Para cada ingrediente de entrada devuelve ` +
    `su "canonical_name" (concepto base, en minúsculas y singular) y su "category".\n` +
    `REUTILIZA exactamente uno de los nombres canónicos del catálogo cuando el concepto coincida, ` +
    `colapsando variedad/color/formato ("cebolla morada picada" -> "cebolla"), pero mantén ` +
    `separados los sustancialmente distintos ("leche" vs "leche de coco").\n` +
    `Si el ingrediente no está en el catálogo, propón un canonical_name nuevo y su category.\n` +
    `"category" SOLO puede ser una de estas, y NUNCA "Otros": ${CATALOG_CATEGORIES.join(', ')}.\n` +
    `Devuelve "input" igual que el nombre de entrada.\n\n` +
    `Catálogo canónico (nombre (categoría)):\n${vocab}\n\n` +
    `Ingredientes de entrada:\n${names.map((n) => `- ${n}`).join('\n')}`;

  const res = await fetchWithTimeout(
    `${BASE}/models/${GEN_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESOLVE_SCHEMA },
      }),
    },
    GEN_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Gemini resolve ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Respuesta de resolución inesperada de Gemini');
  }
  return (JSON.parse(text).items ?? []) as ResolvedIngredient[];
}
```

- [ ] **Step 3: Verificar tipos (Deno)**

Run: `deno check supabase/functions/_shared/gemini.ts`
Expected: sin errores (usa `BASE`, `GEN_MODEL`, `GEN_TIMEOUT_MS`, `apiKey`, `fetchWithTimeout`, ya definidos en el módulo).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/gemini.ts
git commit -m "feat(ai): resolveIngredients (nombre de receta -> canónico + categoría)"
```

---

## Task 3: Reescribir `withIngredientIds`

**Files:**
- Modify: `supabase/functions/_shared/recipes.ts`

- [ ] **Step 1: Actualizar imports**

En `supabase/functions/_shared/recipes.ts`:

Cambia:
```ts
import { embedText, type GeneratedRecipe } from './gemini.ts';
import { ALLERGEN_KEYS, DIET_KEYS, MEAL_TYPE_KEYS, sanitizeKeys } from './preferences.ts';
```
por:
```ts
import { embedText, resolveIngredients, type GeneratedRecipe, type ResolvedIngredient } from './gemini.ts';
import { ALLERGEN_KEYS, CATALOG_CATEGORIES, DIET_KEYS, MEAL_TYPE_KEYS, sanitizeKeys } from './preferences.ts';
```

- [ ] **Step 2: Reemplazar la función `withIngredientIds`**

Sustituye la función completa `withIngredientIds` (el bloque actual desde su comentario
`// Enlaza cada ingrediente...` hasta su `}` de cierre) por:

```ts
// Enlaza cada ingrediente de la receta al catálogo por su canónico. Un resolver IA mapea el
// nombre generado a un canonical_name del vocabulario del catálogo; el servidor lo resuelve a
// id por normalized_name. Los genuinamente nuevos se crean bien categorizados y como su propio
// canónico (canonical_id null). Nunca se crean entradas en 'Otros'. Ante fallo de IA: match
// exacto por nombre y el resto queda sin enlazar (ingredient_id null); la receta se guarda igual.
async function withIngredientIds(
  supabase: SupabaseClient,
  ingredients: { name: string }[],
): Promise<Record<string, unknown>[]> {
  if (ingredients.length === 0) return [];

  const norms = [...new Set(ingredients.map((i) => normalizeName(i.name)).filter(Boolean))];

  // Índice del catálogo COMPLETO por normalized_name (fast-path y precedencia por match exacto).
  const { data: exact } = await supabase
    .from('ingredients')
    .select('id, normalized_name')
    .in('normalized_name', norms);
  const exactByNorm = new Map<string, string>((exact ?? []).map((r) => [r.normalized_name, r.id]));

  const resolved = new Map<string, string>(); // normalizeName(input) -> ingredient_id

  // Fast-path: todos casan exacto -> sin IA.
  if (norms.every((n) => exactByNorm.has(n))) {
    for (const i of ingredients) {
      const n = normalizeName(i.name);
      const id = exactByNorm.get(n);
      if (id) resolved.set(n, id);
    }
    return ingredients.map((i) => ({ ...i, ingredient_id: resolved.get(normalizeName(i.name)) ?? null }));
  }

  // Catálogo canónico como vocabulario del resolver + índice normalized_name -> id de canónicos.
  const { data: canon } = await supabase
    .from('ingredients')
    .select('id, name, category, normalized_name')
    .is('canonical_id', null);
  const canonList = (canon ?? []) as {
    id: string;
    name: string;
    category: string;
    normalized_name: string;
  }[];
  const canonByNorm = new Map<string, string>(canonList.map((c) => [c.normalized_name, c.id]));

  let items: ResolvedIngredient[];
  try {
    items = await resolveIngredients(
      ingredients.map((i) => i.name),
      canonList.map((c) => ({ name: c.name, category: c.category })),
    );
  } catch (e) {
    // Fallback: solo match exacto; el resto sin enlazar. Nunca 'Otros'.
    console.error('resolveIngredients:', e);
    for (const i of ingredients) {
      const n = normalizeName(i.name);
      if (exactByNorm.has(n)) resolved.set(n, exactByNorm.get(n)!);
    }
    return ingredients.map((i) => ({ ...i, ingredient_id: resolved.get(normalizeName(i.name)) ?? null }));
  }

  // input normalizado -> canonical_name normalizado; y set de canónicos nuevos a crear.
  const inputToCanon = new Map<string, string>();
  const toCreate = new Map<string, { name: string; category: string }>();
  for (const it of items) {
    const inputNorm = normalizeName(it.input);
    const canonNorm = normalizeName(it.canonical_name);
    if (!inputNorm || !canonNorm) continue;
    inputToCanon.set(inputNorm, canonNorm);
    if (canonByNorm.has(canonNorm)) continue; // el canónico ya existe
    if (!CATALOG_CATEGORIES.includes(it.category)) continue; // categoría inválida -> no crear
    if (!toCreate.has(canonNorm)) {
      toCreate.set(canonNorm, { name: it.canonical_name.trim(), category: it.category });
    }
  }

  // Crear los nuevos canónicos (canonical_id null), idempotente por normalized_name.
  if (toCreate.size > 0) {
    const rows = [...toCreate.entries()].map(([norm, v]) => ({
      name: v.name,
      normalized_name: norm,
      category: v.category,
      canonical_id: null,
    }));
    await supabase
      .from('ingredients')
      .upsert(rows, { onConflict: 'normalized_name', ignoreDuplicates: true });
    const { data: created } = await supabase
      .from('ingredients')
      .select('id, normalized_name')
      .in('normalized_name', [...toCreate.keys()]);
    for (const r of created ?? []) canonByNorm.set(r.normalized_name, r.id);
  }

  // Resolver cada ingrediente: match exacto primero, luego por canonical_name.
  for (const i of ingredients) {
    const inputNorm = normalizeName(i.name);
    if (exactByNorm.has(inputNorm)) {
      resolved.set(inputNorm, exactByNorm.get(inputNorm)!);
      continue;
    }
    const canonNorm = inputToCanon.get(inputNorm);
    if (canonNorm && canonByNorm.has(canonNorm)) {
      resolved.set(inputNorm, canonByNorm.get(canonNorm)!);
    }
  }

  return ingredients.map((i) => ({ ...i, ingredient_id: resolved.get(normalizeName(i.name)) ?? null }));
}
```

- [ ] **Step 3: Verificar tipos (Deno)**

Run: `deno check supabase/functions/_shared/recipes.ts`
Expected: sin errores. El Step 1 ya importa `resolveIngredients` y el tipo `ResolvedIngredient`
(usado en `let items: ResolvedIngredient[]`), y `CATALOG_CATEGORIES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/recipes.ts
git commit -m "feat(ai): resolver ingredientes al catálogo canónico; sin 'Otros'"
```

---

## Task 4: Verificación end-to-end

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Type-check de todo el módulo compartido**

Run: `deno check supabase/functions/_shared/recipes.ts supabase/functions/_shared/gemini.ts supabase/functions/_shared/preferences.ts`
Expected: sin errores.

- [ ] **Step 2: Baseline — contar 'Otros' antes**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select count(*) as otros from ingredients where category='Otros';"`
Anota el número (p.ej. 111).

- [ ] **Step 3: Generar una receta que fuerce el pipeline**

Con la Supabase local sirviendo las funciones y `GEMINI_API_KEY` disponible, invoca
`search-recipe` con una consulta cuyos ingredientes incluyan variantes y algún genérico:

```bash
set -a; source <(grep '^GEMINI_API_KEY=' supabase/functions/.env); set +a
supabase functions serve --env-file supabase/functions/.env &   # si no está ya sirviendo
SERVE_PID=$!
sleep 3
ANON=$(supabase status --output json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).ANON_KEY))")
curl -s -X POST http://127.0.0.1:54321/functions/v1/search-recipe \
  -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"query":"tortilla de patatas con cebolla"}' | head -c 400
kill $SERVE_PID 2>/dev/null
```
Expected: responde con una receta (origin `db` o `generated`). Si es `db` (ya cacheada), prueba
una consulta más específica para forzar `generated` (p.ej. añadir un ingrediente poco común).

- [ ] **Step 4: Comprobar que NO se crearon 'Otros' nuevos**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select count(*) as otros from ingredients where category='Otros';"`
Expected: **igual** que el baseline del Step 2 (no aumentó). 

Comprobar los ingredientes de la última receta generada enlazan a canónicos/categorías reales:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres <<'SQL'
select ing->>'name' as receta_ing,
       i.name as catalogo, i.category, (i.canonical_id is null) as es_canonico
from recipes rec, jsonb_array_elements(rec.ingredients) ing
left join ingredients i on i.id = (ing->>'ingredient_id')::uuid
where rec.id = (select id from recipes order by created_at desc limit 1);
SQL
```
Expected: cada ingrediente enlaza a una entrada del catálogo con `category` controlada (no 'Otros'); los nuevos salen con `es_canonico = t`.

- [ ] **Step 5 (opcional): Fallback ante fallo de IA**

Repite el Step 3 con `GEMINI_API_KEY=clave-invalida` para forzar el fallo del resolver.
Expected: `search-recipe` puede fallar en la generación (que también usa Gemini), pero si el
guardado se alcanza, no se crean 'Otros'; los ingredientes sin match exacto quedan con
`ingredient_id` null. (Si la generación falla antes, este paso no aplica; el fallback está
cubierto por el `try/catch` y el `deno check`.)

---

## Notas de verificación (resumen)

- **Tipos:** `deno check` limpio en los tres `_shared/*`.
- **E2E:** generar una receta y confirmar que `count(*) where category='Otros'` NO aumenta, y
  que sus ingredientes enlazan a canónicos con categoría controlada.
- **Fuera de alcance:** no se re-mapean recetas existentes, no se toca el prompt de generación,
  ni `recommended_recipes`, ni el cliente.
