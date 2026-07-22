# Resolver de ingredientes al guardar recetas (sin 'Otros') — diseño

Fecha: 2026-07-22

## Problema

El pipeline de guardado de recetas parte el catálogo de ingredientes. `withIngredientIds`
en `supabase/functions/_shared/recipes.ts` busca cada ingrediente de la receta por
`normalized_name` exacto y, si no lo encuentra, **crea una entrada nueva en la categoría
'Otros'**. Como los nombres que genera el LLM ("Cebolla", "cebolla morada picada", "atún en
aceite de oliva") casi nunca casan exacto con las entradas controladas del catálogo, se
acumulan genéricos en 'Otros' desconectados de las entradas que usa la despensa.

El spec `2026-07-22-catalogo-canonico-ingredientes-design.md` arregló el catálogo existente
(columna `canonical_id`, mapeo, y match por canónico en `recommended_recipes`), pero **cada
receta nueva sigue creando 'Otros'** y vuelve a partir el catálogo. Este spec cierra esa fuga.

## Objetivo

Que al guardar una receta cada ingrediente se resuelva al catálogo (canónico) existente, y
que los genuinamente nuevos se creen **bien categorizados** y como su propio canónico.
**Nunca más crear entradas en 'Otros'.**

## Decisiones tomadas

- **Dónde:** resolver **al guardar** (`withIngredientIds`); la generación sigue libre.
- **Cómo:** **IA sobre el catálogo** — una llamada a Gemini por receta que, dados los
  ingredientes de la receta y el vocabulario canónico del catálogo, devuelve por cada uno su
  `canonical_name` (reutilizando el vocabulario) y una `category` controlada.
- **El LLM devuelve `canonical_name` (string), no UUIDs.** El servidor mapea
  `canonical_name → id` por `normalized_name` (evita UUIDs alucinados).
- **Nuevos:** crear la entrada con la categoría sugerida y `canonical_id = null` (su propio
  canónico). Nunca 'Otros'.
- **Fallo de IA:** fallback a match exacto por `normalized_name`; lo no resuelto queda
  `ingredient_id = null` (sin enlazar). La receta se guarda igual. Sin reintento adicional.

## Componentes

### 1. Función IA de resolución (`supabase/functions/_shared/gemini.ts`)

Nueva función `resolveIngredients`:

```ts
export interface ResolvedIngredient {
  input: string;          // nombre tal cual lo generó la receta
  canonical_name: string; // concepto base, reutilizando el vocabulario del catálogo
  category: string;       // una de las categorías controladas
}

export async function resolveIngredients(
  names: string[],
  canonicals: { name: string; category: string }[],
): Promise<ResolvedIngredient[]>;
```

- Salida estructurada (`responseSchema`): array de `{ input, canonical_name, category }`.
- Prompt: se le pasan los nombres de la receta y el vocabulario canónico (nombre + categoría
  de las ~283 entradas canónicas). Instrucciones:
  - Para cada ingrediente devuelve el `canonical_name` del concepto base, **reutilizando
    exactamente** uno de los nombres canónicos dados cuando el concepto coincida (incluye
    variantes: "cebolla morada" → "cebolla"), y manteniendo separados los sustancialmente
    distintos ("leche" vs "leche de coco").
  - Si es un ingrediente que no está en el vocabulario, propón un `canonical_name` nuevo
    (minúsculas, singular) y una `category` de la lista controlada.
  - `category` SOLO de: `Aceites, vinagres y salsas`, `Carnes`, `Cereales, pan y pasta`,
    `Condimentos y edulcorantes`, `Conservas y otros`, `Especias y hierbas`, `Frutas`,
    `Frutos secos y semillas`, `Lácteos y huevos`, `Legumbres`, `Pescados y mariscos`,
    `Verduras y hortalizas`. **Nunca 'Otros'.**

### 2. Reescribir `withIngredientIds` (`supabase/functions/_shared/recipes.ts`)

Nuevo flujo (misma firma pública, mismo retorno: filas de ingrediente con `ingredient_id`):

1. Cargar el catálogo canónico:
   `select id, name, category, normalized_name from ingredients where canonical_id is null`.
   Construir un índice `normalized_name → id`.
2. **Fast-path opcional:** si TODOS los nombres de la receta ya casan por `normalized_name`
   exacto contra el catálogo completo (no solo canónicos), usar esos ids y saltar la IA.
3. Si no, llamar a `resolveIngredients(names, canonicals)` con los nombres y el vocabulario
   canónico (`name` + `category`).
4. Por cada `{ input, canonical_name, category }`:
   - `norm = normalizeName(canonical_name)`.
   - Si `norm` está en el índice del catálogo canónico → `ingredient_id = ese id`.
   - Si no → **crear** `{ name: canonical_name, normalized_name: norm, category, canonical_id: null }`
     y usar su id — **solo si `category` está en el set controlado**; si la categoría no es
     válida, dejar `ingredient_id = null` (sin enlazar) en vez de crear mal categorizado.
   - Dedup: dos inputs con el mismo `norm` crean/mapean una sola vez.
5. Devolver cada ingrediente original con su `ingredient_id` (canónico existente, nuevo, o `null`).

- **Se elimina la rama que creaba entradas en 'Otros'.**
- Creación de nuevos: `upsert` sobre `normalized_name` (idempotente ante concurrencia), luego
  releer para obtener ids (mismo patrón que hoy, pero con `category` real y `canonical_id null`).

### 3. Robustez / errores

- Si `resolveIngredients` lanza (timeout, 4xx/5xx de Gemini, JSON inválido): capturar, hacer
  match exacto por `normalized_name` para lo que se pueda, y dejar el resto `ingredient_id = null`.
  La receta se guarda. Nunca se crea 'Otros'.
- El `normalized_name` usa la misma `normalizeName` actual del módulo.

## Fuera de alcance

- No re-mapea recetas ya guardadas (cubierto por la migración canónica previa).
- No toca el prompt de generación de recetas ni añade embeddings.
- No añade flujo de revisión de nuevos (se crean directamente bien categorizados).
- No modifica `recommended_recipes` ni el match del cliente.

## Verificación

- `deno check` de `_shared/gemini.ts` y `_shared/recipes.ts`.
- Generar una receta vía `search-recipe` (o `chat`) con ingredientes variados (incluyendo
  variantes como "cebolla morada" y algo genérico como "tomate"):
  - Comprobar en la BD que **no** aparecen filas nuevas con `category = 'Otros'`.
  - Los ingredientes de la receta enlazan a canónicos existentes (`ingredient_id` cuyo
    `canonical_id is null` o resoluble a uno).
  - Un ingrediente genuinamente nuevo se crea con categoría controlada y `canonical_id = null`.
- Simular fallo de IA (p.ej. `GEMINI_API_KEY` inválida en un entorno de prueba) y confirmar
  que la receta se guarda sin crear 'Otros' y con ids null donde no hubo match exacto.
