# Unificar el match del cliente a canónico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el cliente case ingredientes de receta contra despensa y lista de compra por canónico (`coalesce(canonical_id, id)`), con el match por nombre solo como respaldo para ingredientes sin `ingredient_id`.

**Architecture:** Un mapa `id → canonical_id` del catálogo, cacheado en cliente, alimenta un predicado `sameIngredient(aId,aName,bId,bName,map)` (ambos con id → canónico; falta id → nombre). Los 4 matchers (`isMissing`, `isMissingByStock`, `computeCookDeltas`, `findMatch`) pasan a usarlo. `PantryMatch` se vuelve una lista item-based. Si el mapa no carga (Map vacío), `canon` devuelve el id tal cual y todo degrada al comportamiento previo (id exacto + nombre).

**Tech Stack:** Expo React Native (TypeScript), Supabase JS.

**Rama:** `feat/client-match-canonico` (desde `main`).

**Sin infra de tests:** verificación con `pnpm --filter @recetas/mobile exec tsc --noEmit` y dev-client. `tsc` queda limpio solo al final (los cambios de firma/tipo rompen consumidores hasta la última tarea).

---

## File Structure

**Modificar:**
- `apps/mobile/src/lib/ingredients.ts` — `CanonicalMap`, `getCanonicalMap` (cacheado), `canon`.
- `apps/mobile/src/lib/pantry-match.ts` — `sameIngredient`; matchers toman `CanonicalMap`.
- `apps/mobile/src/lib/pantry.ts` — `PantryMatch` a lista item-based.
- `apps/mobile/src/lib/shopping-plan.ts` — `findMatch`/`buildPlan` toman `CanonicalMap`.
- `apps/mobile/src/features/recipe-detail/hooks/use-recipe-detail.ts` — carga y pasa el mapa.
- `apps/mobile/src/app/receta/[id].tsx` — pasa `canonMap` a `IngredientList`.
- `apps/mobile/src/features/recipe-detail/components/ingredient-list.tsx` — prop `canonMap`.
- `apps/mobile/src/features/chat/hooks/use-chat.ts` — carga y devuelve el mapa.
- `apps/mobile/src/app/(tabs)/chat.tsx` — pasa `canonMap` a `ChatMessageView`.
- `apps/mobile/src/features/chat/components/chat-message.tsx` — reenvía `canonMap`.
- `apps/mobile/src/features/chat/components/chat-recipe-card.tsx` — prop `canonMap`.
- `apps/mobile/src/components/add-missing-button.tsx` — carga el mapa y lo pasa a `buildPlan`.

---

## Task 1: Resolver canónico cacheado

**Files:**
- Modify: `apps/mobile/src/lib/ingredients.ts`

- [ ] **Step 1: Añadir tipo, mapa cacheado y helper**

Al final de `apps/mobile/src/lib/ingredients.ts` añade:

```ts
export type CanonicalMap = Map<string, string>; // varianteId -> canónicoId

let canonicalCache: CanonicalMap | null = null;

// Mapa id->canónico de las variantes (canonical_id not null), cacheado por sesión. Si el fetch
// falla devuelve un mapa vacío y no cachea (para reintentar en la siguiente llamada).
export async function getCanonicalMap(): Promise<CanonicalMap> {
  if (canonicalCache) return canonicalCache;
  const { data, error } = await supabase
    .from('ingredients')
    .select('id, canonical_id')
    .not('canonical_id', 'is', null);
  if (error) return new Map();
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.id as string, row.canonical_id as string);
  canonicalCache = map;
  return map;
}

// canon(id) = su canónico si es variante; el propio id si es canónico o desconocido.
export function canon(id: string, map: CanonicalMap): string {
  return map.get(id) ?? id;
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit`
Expected: limpio salvo los 4 errores preexistentes de `_layout.tsx` (no relacionados). Esta tarea no rompe nada.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/lib/ingredients.ts
git commit -m "feat(match): mapa canónico cacheado en cliente (getCanonicalMap/canon)"
```

---

## Task 2: Predicado `sameIngredient` y matchers por canónico

**Files:**
- Modify: `apps/mobile/src/lib/pantry-match.ts`

- [ ] **Step 1: Importar `canon`/`CanonicalMap`**

En `apps/mobile/src/lib/pantry-match.ts`, cambia la primera línea de import:
```ts
import { normalize } from './ingredients';
```
por:
```ts
import { canon, normalize, type CanonicalMap } from './ingredients';
```

- [ ] **Step 2: Añadir `sameIngredient`**

Justo después de la función `nameMatches` (antes de `isMissing`), añade:

```ts
// ¿El ingrediente de receta y el item de despensa/compra son el mismo? Con ambos ids -> por
// canónico (preciso); si falta id en algún lado -> por nombre (respaldo para añadidos manuales
// o ingredientes sin resolver).
export function sameIngredient(
  aId: string | null | undefined,
  aName: string,
  bId: string | null | undefined,
  bName: string,
  map: CanonicalMap,
): boolean {
  if (aId && bId) return canon(aId, map) === canon(bId, map);
  return nameMatches(words(aName), words(bName));
}
```

- [ ] **Step 3: Reescribir `isMissing`**

Sustituye la función `isMissing` completa por (nota: `PantryMatch` pasa a ser una lista en la Task 3; esta firma ya la asume):

```ts
// Un ingrediente falta si no es un básico y no está en la despensa (por canónico o, sin id,
// por nombre).
export function isMissing(
  ingredient: RecipeIngredient,
  pantry: PantryMatch,
  map: CanonicalMap,
): boolean {
  if (isBasic(ingredient.name)) return false;
  return !pantry.some((p) =>
    sameIngredient(ingredient.ingredient_id, ingredient.name, p.ingredient_id, p.name, map),
  );
}
```

- [ ] **Step 4: Reescribir el filtro de `isMissingByStock`**

En `isMissingByStock`, cambia la firma para añadir `map` y sustituye el bloque de `matches`
(elimina la línea `const recipeWords = words(ingredient.name);`). El resto (lógica de cantidad)
queda igual:

```ts
export function isMissingByStock(
  ingredient: RecipeIngredient,
  pantry: CookPantryItem[],
  map: CanonicalMap,
): boolean {
  if (isBasic(ingredient.name)) return false;
  const matches = pantry.filter((p) =>
    sameIngredient(ingredient.ingredient_id, ingredient.name, p.ingredient_id, p.name, map),
  );
  if (matches.length === 0) return true;
  if (ingredient.quantity == null || ingredient.quantity <= 0) return false;
  const unit = normalizeUnit(ingredient.unit);
  const comparable = matches.filter((p) => p.quantity != null && normalizeUnit(p.unit) === unit);
  if (comparable.length === 0) return false;
  const available = comparable.reduce((sum, p) => sum + (p.quantity ?? 0), 0);
  return available < ingredient.quantity;
}
```

- [ ] **Step 5: Reescribir el filtro de `computeCookDeltas`**

En `computeCookDeltas`, añade `map` a la firma y sustituye el `.filter(...)` de `matches` por
`sameIngredient` (elimina `const recipeWords = words(ing.name);`). El `.sort(...)` y el bucle
de reparto quedan igual:

```ts
export function computeCookDeltas(
  ingredients: RecipeIngredient[],
  pantryItems: CookPantryItem[],
  map: CanonicalMap,
): CookDelta[] {
  const deltas: CookDelta[] = [];
  for (const ing of ingredients) {
    if (ing.quantity == null || ing.quantity <= 0 || isBasic(ing.name)) continue;
    const matches = pantryItems
      .filter(
        (p) =>
          (p.quantity ?? 0) > 0 &&
          sameIngredient(ing.ingredient_id, ing.name, p.ingredient_id, p.name, map),
      )
      // Menor stock primero, comparando en la unidad de la receta; los no comparables al final.
      .sort(
        (a, b) =>
          (convertQuantity(a.quantity ?? 0, a.unit, ing.unit) ?? Infinity) -
          (convertQuantity(b.quantity ?? 0, b.unit, ing.unit) ?? Infinity),
      );
    let need = ing.quantity; // en la unidad de la receta
    for (const p of matches) {
      if (need <= EPSILON) break;
      const needInItemUnit = convertQuantity(need, ing.unit, p.unit);
      if (needInItemUnit == null) continue; // unidad no comparable: no se descuenta este item
      const sub = Math.min(p.quantity ?? 0, needInItemUnit);
      if (sub <= EPSILON) continue; // evita deltas basura por residuos de coma flotante
      deltas.push({ pantry_item_id: p.id, quantity: sub });
      need -= convertQuantity(sub, p.unit, ing.unit) ?? 0;
    }
  }
  return deltas;
}
```

- [ ] **Step 6: Verificar (se espera romper consumidores)**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit`
Expected: errores en los CONSUMIDORES (les falta el arg `map`) y un error TRANSITORIO en el
propio `pantry-match.ts`: `isMissing` usa `pantry.some(...)` pero `PantryMatch` todavía es
`{ids,names}` hasta la Task 3. Todo se resuelve en las Tasks 3 y 5. No lo trates como fallo.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/pantry-match.ts
git commit -m "feat(match): sameIngredient por canónico; matchers toman CanonicalMap"
```

---

## Task 3: `PantryMatch` item-based

**Files:**
- Modify: `apps/mobile/src/lib/pantry.ts`

- [ ] **Step 1: Cambiar el tipo y `getPantryMatch`**

Sustituye la interfaz `PantryMatch` y la función `getPantryMatch` por:

```ts
// Lo que hay en la despensa, para saber qué ingredientes de una receta faltan (item-based:
// mantiene la asociación id<->nombre para casar por par).
export type PantryMatch = { ingredient_id: string | null; name: string }[];

export async function getPantryMatch(): Promise<PantryMatch> {
  const { data, error } = await supabase.from('pantry_items').select('ingredient_id, name');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ingredient_id: (row.ingredient_id as string | null) ?? null,
    name: (row.name as string) ?? '',
  }));
}
```

- [ ] **Step 2: Quitar el import de `normalize` si queda sin uso**

`getPantryMatch` ya no usa `normalize`. Comprueba si `normalize` sigue usándose en
`apps/mobile/src/lib/pantry.ts` (`grep -n "normalize" apps/mobile/src/lib/pantry.ts`). Si no,
elimínalo del import `import { normalize } from './ingredients';` (línea ~4). Si `./ingredients`
deja de importar algo, quita la línea entera.

- [ ] **Step 3: Verificar (se espera romper consumidores)**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit`
Expected: siguen los errores en consumidores del chat (usaban `pantry.ids`/`pantry.names`),
que se arreglan en la Task 5. `pantry.ts` en sí sin errores propios.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/pantry.ts
git commit -m "feat(match): PantryMatch item-based (id + nombre por fila)"
```

---

## Task 4: `shopping-plan` por canónico

**Files:**
- Modify: `apps/mobile/src/lib/shopping-plan.ts`

- [ ] **Step 1: Cambiar imports**

Sustituye:
```ts
import { namesMatch, normalizeUnit } from './pantry-match';
```
por:
```ts
import { sameIngredient, normalizeUnit } from './pantry-match';
import type { CanonicalMap } from './ingredients';
```

- [ ] **Step 2: `findMatch` y `buildPlan` toman el mapa**

Sustituye `findMatch` por:
```ts
function findMatch(
  target: ShoppingTarget,
  shopping: ShoppingItem[],
  map: CanonicalMap,
): ShoppingItem | undefined {
  return shopping.find((item) =>
    sameIngredient(target.ingredient_id, target.name, item.ingredient_id, item.name, map),
  );
}
```

Cambia la firma de `buildPlan` y la llamada a `findMatch`:
```ts
export function buildPlan(
  targets: ShoppingTarget[],
  shopping: ShoppingItem[],
  map: CanonicalMap,
): ShoppingPlan {
  const toInsert: ShoppingTarget[] = [];
  const bumps = new Map<string, number>();
  for (const target of targets) {
    const match = findMatch(target, shopping, map);
    if (!match) {
      toInsert.push(target);
    } else if (!covers(match, target) && target.quantity != null) {
      bumps.set(match.id, Math.max(bumps.get(match.id) ?? 0, target.quantity));
    }
  }
  const toBump = [...bumps.entries()].map(([id, quantity]) => ({ id, quantity }));
  return { toInsert, toBump };
}
```

- [ ] **Step 3: Verificar (rompe `add-missing-button`)**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit`
Expected: error en `add-missing-button.tsx` (le falta el arg `map` a `buildPlan`), se arregla
en la Task 5.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/shopping-plan.ts
git commit -m "feat(match): shopping-plan casa por canónico"
```

---

## Task 5: Enhebrar el mapa en los consumidores

**Files:**
- Modify: `use-recipe-detail.ts`, `receta/[id].tsx`, `ingredient-list.tsx`, `use-chat.ts`,
  `chat.tsx`, `chat-message.tsx`, `chat-recipe-card.tsx`, `add-missing-button.tsx`

- [ ] **Step 1: `use-recipe-detail.ts`**

Añade el import:
```ts
import { getCanonicalMap, type CanonicalMap } from '@/lib/ingredients';
```
Añade estado tras `const [pantry, setPantry] = useState<CookPantryItem[] | null>(null);`:
```ts
  const [canonMap, setCanonMap] = useState<CanonicalMap>(new Map());
```
En el `useEffect` que carga la despensa (el de `getPantryForCook`), añade la carga del mapa
dentro del mismo effect (antes del `return`):
```ts
    getCanonicalMap()
      .then((data) => {
        if (active) setCanonMap(data);
      })
      .catch(() => {});
```
En `startCooking`, cambia la llamada:
```ts
      await cookRecipe(recipe.id, servings, computeCookDeltas(scaled, items, canonMap));
```
Añade `canonMap` al objeto de retorno del hook (junto a `pantry`).

- [ ] **Step 2: `app/receta/[id].tsx`**

En el destructuring de `useRecipeDetail(...)` añade `canonMap` (junto a `pantry`). Cambia el
render de `IngredientList`:
```tsx
                <IngredientList key={servings} ingredients={scaledIngredients} pantry={pantry} canonMap={canonMap} />
```

- [ ] **Step 3: `ingredient-list.tsx`**

Import:
```ts
import type { CanonicalMap } from '@/lib/ingredients';
```
Añade `canonMap` a las props del componente:
```tsx
export function IngredientList({
  ingredients,
  pantry,
  canonMap,
}: {
  ingredients: RecipeIngredient[];
  pantry: CookPantryItem[] | null;
  canonMap: CanonicalMap;
}) {
```
Cambia las dos llamadas a `isMissingByStock` para pasar `canonMap`:
```ts
    ? ingredients.filter((i) => isMissingByStock(i, pantry, canonMap))
```
y
```ts
          const falta = pantry ? isMissingByStock(ingredient, pantry, canonMap) : false;
```

- [ ] **Step 4: `use-chat.ts`**

Import:
```ts
import { getCanonicalMap, type CanonicalMap } from '@/lib/ingredients';
```
Añade estado tras `const [pantry, setPantry] = useState<PantryMatch | null>(null);`:
```ts
  const [canonMap, setCanonMap] = useState<CanonicalMap>(new Map());
```
En el `useEffect` que carga `getPantryMatch`, añade dentro (antes del `return`):
```ts
    getCanonicalMap()
      .then((data) => {
        if (active) setCanonMap(data);
      })
      .catch(() => {});
```
Añade `canonMap` al objeto de retorno del hook.

- [ ] **Step 5: `app/(tabs)/chat.tsx`**

En el destructuring de `useChat()` añade `canonMap`. En el render de `ChatMessageView` añade
la prop:
```tsx
                pantry={pantry}
                canonMap={canonMap}
```

- [ ] **Step 6: `chat-message.tsx`**

Import:
```ts
import type { CanonicalMap } from '@/lib/ingredients';
```
Añade `canonMap` a las props y reenvíalo a `ChatRecipeCard`. En la firma del componente:
```tsx
export function ChatMessageView({
  message,
  pantry,
  canonMap,
  onPickSuggestion,
}: {
  message: ChatMessage;
  pantry: PantryMatch | null;
  canonMap: CanonicalMap;
  onPickSuggestion: (title: string) => void;
}) {
```
Y donde se renderiza `<ChatRecipeCard recipe={...} pantry={pantry} />` (busca la línea; está en
el cuerpo del componente), añade `canonMap={canonMap}`.

- [ ] **Step 7: `chat-recipe-card.tsx`**

Import:
```ts
import type { CanonicalMap } from '@/lib/ingredients';
```
Cambia la firma para aceptar `canonMap`:
```tsx
export function ChatRecipeCard({
  recipe,
  pantry,
  canonMap,
}: {
  recipe: Recipe;
  pantry: PantryMatch | null;
  canonMap: CanonicalMap;
}) {
```
Cambia las dos llamadas a `isMissing`:
```ts
  const missing = pantry ? scaled.filter((ing) => isMissing(ing, pantry, canonMap)) : [];
```
y
```ts
            const falta = pantry ? isMissing(ing, pantry, canonMap) : false;
```

- [ ] **Step 8: `add-missing-button.tsx`**

Imports:
```ts
import { getCanonicalMap, type CanonicalMap } from '@/lib/ingredients';
```
Añade estado tras `const [failed, setFailed] = useState(false);`:
```ts
  const [canonMap, setCanonMap] = useState<CanonicalMap>(new Map());
```
Carga el mapa una vez (añade este `useEffect` — importa `useEffect` de 'react' si no está):
```ts
  useEffect(() => {
    let active = true;
    getCanonicalMap()
      .then((data) => {
        if (active) setCanonMap(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
```
Cambia la llamada a `buildPlan`:
```ts
  const plan = targets ? buildPlan(targets, shopping, canonMap) : null;
```

- [ ] **Step 9: Verificación final**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit`
Expected: limpio (solo los 4 errores preexistentes de `_layout.tsx`). Si hay otros, corrígelos.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src/features/recipe-detail/hooks/use-recipe-detail.ts "apps/mobile/src/app/receta/[id].tsx" apps/mobile/src/features/recipe-detail/components/ingredient-list.tsx apps/mobile/src/features/chat/hooks/use-chat.ts "apps/mobile/src/app/(tabs)/chat.tsx" apps/mobile/src/features/chat/components/chat-message.tsx apps/mobile/src/features/chat/components/chat-recipe-card.tsx apps/mobile/src/components/add-missing-button.tsx
git commit -m "feat(match): enhebrar el mapa canónico en despensa/cocinar/chat/compra"
```

---

## Task 6: Verificación end-to-end (dev-client)

**Files:** ninguno.

- [ ] **Step 1: Comprobar en el dispositivo**

Con la app recargada:
- **Detalle de receta**: "lo que falta" refleja la despensa por canónico — "Cebolla blanca"
  en despensa satisface "cebolla" de la receta; tener "leche" NO marca como disponible
  "leche de coco".
- **Cocinar**: el auto-descuento resta de la variante correcta de la despensa.
- **Tarjeta de chat**: los badges de "Falta" son correctos.
- **Lista de compra** (AddMissingButton): añadir lo que falta no duplica un ingrediente que ya
  está en la lista en otra variante (casa por canónico); sube cantidad si corresponde.

- [ ] **Step 2: Comprobar el degradado (opcional)**

Con el dispositivo sin red momentáneamente al abrir (o si `getCanonicalMap` devuelve vacío), el
match sigue funcionando por id exacto + nombre, sin crash.

---

## Notas de verificación (resumen)

- **Tipos:** `tsc --noEmit` limpio tras la Task 5 (solo los 4 errores preexistentes de `_layout.tsx`).
- **E2E:** dev-client, según Task 6 (precisión: leche ≠ leche de coco; variante satisface genérico).
- **Fuera de alcance:** no toca servidor/esquema/pipeline; no re-cura canónicos.
