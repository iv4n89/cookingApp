# Unificar el match del cliente a canónico — diseño

Fecha: 2026-07-22

## Problema

El cliente casa ingredientes de receta contra la despensa (y la lista de compra) por
**nombre** (`apps/mobile/src/lib/pantry-match.ts`, con tolerancia a plurales/subcadena) además
de por `ingredient_id` exacto. El match por nombre tiene falsos positivos: p.ej. la despensa
"leche" da por satisfecho el ingrediente de receta "leche de coco" (`nameMatches(["leche"],
["leche","coco"])` → true). El servidor (`recommended_recipes`) ya casa por canónico
(`coalesce(canonical_id, id)`); el cliente no, así que hay dos sistemas de match y el del
cliente es impreciso.

## Objetivo

Unificar todo el match del cliente al modelo canónico del servidor: dos ingredientes casan si
`canon(a) = canon(b)`, con `canon(x) = coalesce(canonical_id, id)`. El match por nombre queda
solo como respaldo para ingredientes sin `ingredient_id`.

## Sitios afectados (4)

Todos hacen hoy `id-exacto || nombre`:
1. `isMissing(ingredient, PantryMatch)` — tarjeta de receta del chat (`chat-recipe-card.tsx`).
2. `isMissingByStock(ingredient, CookPantryItem[])` — "lo que falta" del detalle
   (`ingredient-list.tsx`).
3. `computeCookDeltas(ingredients, CookPantryItem[])` — auto-descuento al cocinar
   (`use-recipe-detail.ts`).
4. `findMatch(target, ShoppingItem[])` — receta↔lista de compra (`shopping-plan.ts`).

## Decisiones tomadas

- **Fuente del canónico:** un mapa `id → canonical_id` del catálogo, **cacheado** en el cliente.
- **Regla de match:** si **ambos** lados tienen `ingredient_id` → match por canónico; si **falta
  id en algún lado** → match por nombre (respaldo para añadidos manuales / ingredientes sin
  resolver).
- **`PantryMatch`** pasa de dos sets planos a **lista item-based** `{ ingredient_id, name }`
  para poder aplicar la regla por par.
- **Robustez:** si el mapa canónico no carga, `canon` devuelve el id tal cual → degrada al
  comportamiento previo (id exacto + nombre). No rompe.

## Componentes

### 1. Resolver canónico cacheado (`apps/mobile/src/lib/ingredients.ts`)

```ts
export type CanonicalMap = Map<string, string>; // varianteId -> canónicoId

// Cacheado a nivel de módulo (rara vez cambia). Solo variantes (canonical_id not null).
export async function getCanonicalMap(): Promise<CanonicalMap>;

// canon(id) = id si es canónico o desconocido; si es variante, su canónico.
export function canon(id: string, map: CanonicalMap): string;
```

- `getCanonicalMap`: `select id, canonical_id from ingredients where canonical_id is not null`,
  construye `Map(id → canonical_id)`, y lo cachea en una variable de módulo (fetch una vez por
  sesión; si el fetch falla devuelve un mapa vacío y no cachea, para reintentar).

### 2. Predicado unificado (`apps/mobile/src/lib/pantry-match.ts`)

```ts
// ¿El ingrediente de receta y el item de despensa/compra son el mismo?
// Ambos con id -> por canónico; si falta id en algún lado -> por nombre.
export function sameIngredient(
  aId: string | null | undefined,
  aName: string,
  bId: string | null | undefined,
  bName: string,
  map: CanonicalMap,
): boolean;
```

- Los matchers existentes (`isMissing`, `isMissingByStock`, `computeCookDeltas`) y
  `findMatch`/`buildPlan` de `shopping-plan.ts` reciben la `CanonicalMap` y sustituyen su
  condición `(id exacto) || nameMatches(...)` por `sameIngredient(...)`.
- Se conservan intactas la lógica de básicos (`isBasic`), de cantidades/unidades
  (`convertQuantity`, el reparto de `computeCookDeltas`, `isMissingByStock` por stock) y el
  matcher por palabras (`nameMatches`), que ahora solo se usa dentro de `sameIngredient` como
  respaldo.

### 3. Despensa item-based (`apps/mobile/src/lib/pantry.ts`)

- `PantryMatch` deja de ser `{ ids: Set, names: Set }` y pasa a ser una lista:
  `export type PantryMatch = { ingredient_id: string | null; name: string }[]`.
- `getPantryMatch` devuelve esa lista (selecciona `ingredient_id, name`; el nombre se
  normaliza dentro del matcher, como hoy, no al fetch).
- `getPantryForCook` ya devuelve `CookPantryItem[]` con `ingredient_id` y `name`.

### 4. Consumidores

Cada punto que casa obtiene el mapa canónico (cacheado) y lo pasa a los matchers:
- `use-recipe-detail.ts`: carga el mapa junto a la despensa; lo pasa a `computeCookDeltas` y lo
  provee a `ingredient-list.tsx` para `isMissingByStock`.
- `ingredient-list.tsx`: recibe el mapa (por props del hook) y lo pasa a `isMissingByStock`.
- `use-chat.ts` + `chat-recipe-card.tsx` (y `chat-message.tsx` que reenvía `pantry`): cargan y
  pasan el mapa a `isMissing`.
- `shopping-plan.ts` (`buildPlan`/`findMatch`): reciben el mapa por parámetro. Quien lo carga
  (cacheado) y lo pasa es `add-missing-button.tsx`, que es donde se construye el plan.

## Fuera de alcance

- No toca el servidor ni el esquema (el canónico ya existe en `ingredients.canonical_id`).
- No cambia la generación ni el pipeline.
- No re-cura canónicos ni toca datos.
- No añade invalidación en vivo del mapa cacheado (basta con refetch por sesión).

## Verificación

- `pnpm --filter @recetas/mobile exec tsc --noEmit` limpio.
- En el dev-client:
  - Detalle de receta: "lo que falta" refleja correctamente lo que hay en despensa por
    canónico (p.ej. "Cebolla blanca" satisface "cebolla" de la receta; "leche" NO satisface
    "leche de coco").
  - Cocinar: el auto-descuento resta de la variante correcta.
  - Tarjeta de chat: los badges de "falta" son correctos.
  - Lista de compra: al añadir lo que falta, no duplica un ingrediente que ya está en la lista
    en otra variante (casa por canónico).
- Comprobación de degradado: si `getCanonicalMap` devuelve vacío (simulando fallo), el match
  sigue funcionando por id exacto + nombre (sin crash).
