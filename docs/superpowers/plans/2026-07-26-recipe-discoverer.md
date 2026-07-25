# Descubridor de recetas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliges ingredientes, pulsas Descubrir y pasas recetas a pantalla completa como reels, guardando las que te gustan con doble toque.

**Architecture:** Una RPC calcula las recetas que encajan (match por canónico, ignorando básicos, con tope de extras) y avisa de alérgenos sin filtrar. El cliente añade un selector multi-ingrediente y un visor vertical paginado. Un script rellena las imágenes que faltan en el catálogo.

**Tech Stack:** Supabase (Postgres, pgTAP), Expo Router, React Native, NativeWind, Node (script).

Spec: `docs/superpowers/specs/2026-07-26-recipe-discoverer-design.md`. Rama: `feat/recipe-discoverer`.

**Slices:** PR A = Tasks 1-2 (backend, `db push`). PR B = Task 3 (script imágenes). PR C = Tasks 4-6 (cliente, rebuild APK).

---

## Estructura de ficheros

- Create `supabase/migrations/0068_discover_recipes_by_ingredients.sql` — RPC del motor.
- Create `supabase/tests/0013_recipe_discoverer.test.sql` — pgTAP de la RPC.
- Create `scripts/backfill-recipe-images.mjs` — rellena imágenes del catálogo.
- Modify `apps/mobile/src/lib/recipes.ts` — `DiscoverCard` + `discoverByIngredients()`.
- Create `apps/mobile/src/features/discoverer/components/ingredient-multi-select.tsx` — selector.
- Create `apps/mobile/src/features/discoverer/components/recipe-reel.tsx` — página del visor.
- Create `apps/mobile/src/app/descubrir.tsx` — pantalla (selector → visor).
- Modify `apps/mobile/src/app/(tabs)/recetas.tsx` — botón de entrada al descubridor.

---

### Task 1: RPC `discover_recipes_by_ingredients` (migración 0068)

**Files:**
- Create: `supabase/migrations/0068_discover_recipes_by_ingredients.sql`

**Contexto:** el match por canónico usa `coalesce(canonical_id, id)` (migr 0027). La lista de básicos
asumidos debe ser IDÉNTICA a la del motor
(`supabase/migrations/0065_recommendation_taste_affinity.sql:319-323`). El mapa de alérgenos es
`need_allergen_map` con la misma lista de needs que `build_household_recommendation_snapshot`
(`supabase/migrations/0053_recommendation_decision.sql:401-404`).

- [ ] **Step 1: Crear la migración**

```sql
-- Descubridor: recetas que encajan con un conjunto de ingredientes elegidos. El match es por
-- canónico (elegir "cebolla" casa con "cebolla blanca") y los básicos asumidos (sal, aceite,
-- pimienta) no cuentan como ingrediente extra. Con 2+ ingredientes elegidos se aplica el tope de
-- extras; con uno solo no, para el modo "pollo, a ver qué sale".
-- No filtra por alérgenos: devuelve warnAllergens para que el cliente avise.
create function public.discover_recipes_by_ingredients(
  p_ingredient_ids uuid[],
  p_max_extra integer default 2,
  p_limit integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_selected uuid[];
  v_household_id uuid := public.current_household_id();
  v_warn text[] := '{}';
  v_result jsonb;
begin
  if p_ingredient_ids is null or cardinality(p_ingredient_ids) = 0 then
    return '[]'::jsonb;
  end if;

  -- Canónicos de los ingredientes elegidos.
  select coalesce(array_agg(distinct coalesce(i.canonical_id, i.id)), '{}')
  into v_selected
  from public.ingredients i
  where i.id = any(p_ingredient_ids);

  -- Alérgenos que chocan con las necesidades del hogar (solo para avisar, no filtra).
  if v_household_id is not null then
    select coalesce(array_agg(distinct m.allergen), '{}')
    into v_warn
    from public.household_members hm
    join public.user_preferences up on up.user_id = hm.user_id
    cross join lateral unnest(up.special_needs) as need(value)
    join public.need_allergen_map m
      on m.need = need.value
     and m.need in (
       'Frutos secos', 'Cacahuete', 'Marisco', 'Pescado', 'Huevo', 'Leche', 'Soja',
       'Sésamo', 'Mostaza', 'Apio', 'Lactosa', 'Gluten / celiaquía', 'Sin cerdo', 'Sin alcohol'
     )
    where hm.household_id = v_household_id;
  end if;

  select coalesce(jsonb_agg(card order by uses desc, extras asc, has_image desc, rnd), '[]'::jsonb)
  into v_result
  from (
    select
      jsonb_build_object(
        'recipeId', r.id,
        'title', r.title,
        'description', r.description,
        'imageUrl', r.image_url,
        'imageStatus', r.image_status,
        'extras', stats.extras,
        'ingredientNames', stats.names,
        'warnAllergens', to_jsonb(
          coalesce(array(select unnest(r.allergens) intersect select unnest(v_warn)), '{}')
        )
      ) as card,
      stats.uses,
      stats.extras,
      (r.image_status = 'ready' and r.image_url is not null) as has_image,
      random() as rnd
    from public.recipes r
    cross join lateral (
      select
        count(*) filter (where ing.canon = any(v_selected)) as uses,
        count(*) filter (where not ing.basic and not (ing.canon = any(v_selected))) as extras,
        coalesce(jsonb_agg(ing.name order by ing.ord), '[]'::jsonb) as names
      from (
        select
          coalesce(ri.canonical_id, ri.id) as canon,
          coalesce(item.value->>'name', 'Ingrediente') as name,
          item.ordinality as ord,
          lower(btrim(coalesce(canonical_ri.normalized_name, ''))) in (
            'sal marina', 'sal gorda', 'sal fina', 'sal de mesa',
            'aceite de oliva virgen extra', 'aceite de oliva suave', 'aceite de girasol',
            'pimienta negra', 'pimienta de sichuan', 'sal y pimienta'
          ) as basic
        from jsonb_array_elements(coalesce(r.ingredients, '[]'::jsonb)) with ordinality item(value, ordinality)
        left join lateral (
          select case
            when item.value->>'ingredient_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (item.value->>'ingredient_id')::uuid
            else null
          end as id
        ) raw on true
        left join public.ingredients ri on ri.id = raw.id
        left join public.ingredients canonical_ri on canonical_ri.id = coalesce(ri.canonical_id, ri.id)
      ) ing
    ) stats
    where r.reusable
      and stats.uses >= 1
      and (cardinality(v_selected) < 2 or stats.extras <= p_max_extra)
    order by stats.uses desc, stats.extras asc, has_image desc, random()
    limit p_limit
  ) ranked;

  return v_result;
end;
$$;

revoke execute on function public.discover_recipes_by_ingredients(uuid[], integer, integer)
  from public, anon;
grant execute on function public.discover_recipes_by_ingredients(uuid[], integer, integer)
  to authenticated;
```

Nota de implementación: si Postgres se queja de referenciar `stats.*` en el `where`/`order by` del
mismo nivel del `cross join lateral`, envuelve la subconsulta en un nivel más (`select ... from (
select ..., stats.uses as uses ... ) x where x.uses >= 1 ...`). Ajusta hasta que compile
manteniendo la semántica descrita.

- [ ] **Step 2: Aplicar en local**

Run: `supabase migration up --local`
Expected: aplica `0068` sin error.

- [ ] **Step 3: Prueba manual rápida**

Run:
```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select jsonb_array_length(public.discover_recipes_by_ingredients(array[(select id from public.ingredients where normalized_name='arroz bomba')], 2, 10));"
```
Expected: un número ≥ 0 sin error (la RPC es `security definer`; sin JWT, `current_household_id()`
puede ser null y debe seguir funcionando, devolviendo warnAllergens vacíos).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0068_discover_recipes_by_ingredients.sql
git commit -m "feat: RPC del descubridor de recetas por ingredientes"
```

---

### Task 2: pgTAP del descubridor

**Files:**
- Create: `supabase/tests/0013_recipe_discoverer.test.sql`

**Contexto:** sigue el patrón de fixtures de `supabase/tests/0012_taste_personalization.test.sql`
(usuario nuevo `...0904`, `user_preferences`, `set_config` del jwt). Los ingredientes deben existir en
el catálogo local (`arroz bomba`, `manzana golden`, `sal fina`, etc.).

- [ ] **Step 1: Escribir el test**

Fixtures: elige dos ingredientes reales A y B del catálogo (p. ej. `arroz bomba` y `manzana golden`),
más `sal fina` (básico) y otros 5 ingredientes cualesquiera para construir:
- Receta `R1`: A + B + 1 ingrediente extra → 1 extra.
- Receta `R2`: A + B + 5 ingredientes extra → 5 extras.
- Receta `R3`: A + `sal fina` + `aceite de oliva virgen extra` → 0 extras (los básicos no cuentan).
- Receta `R4`: usa la **variante** de un canónico (elige un par variante/canónico real, p. ej.
  `cebolla` → canónico `cebolla blanca`) para probar el match canónico.
- Receta `R5`: contiene `allergens = '{gluten}'` y usa A.
Todas `reusable = true`.

Asserts (ajusta `plan(N)`):
1. `has_function('public','discover_recipes_by_ingredients', array['uuid[]','integer','integer'])`;
   `authenticated` puede EXECUTE y `anon` no.
2. Con `[A, B]` y `p_max_extra=2`: el resultado contiene `R1` y **no** contiene `R2`.
3. Con `[A]` (uno solo): el resultado **sí** contiene `R2` (sin tope de extras).
4. Con `[A]`: `R3` aparece con `extras = 0` (sal y aceite no cuentan).
5. Con el id del **canónico** elegido, `R4` (que usa la variante) aparece.
6. `discover_recipes_by_ingredients(array[]::uuid[])` → `'[]'::jsonb`.
7. Con `special_needs = array['Gluten / celiaquía']` en el usuario: `R5` **aparece** y su
   `warnAllergens` contiene `gluten`.

Para los asserts de pertenencia usa un `exists` sobre `jsonb_array_elements(...)` comparando
`->>'recipeId'`, no `@>` sobre la card completa (el orden lleva `random()` y las cards traen más
campos).

- [ ] **Step 2: Ejecutar y ajustar hasta verde**

Run: `pnpm test:db`
Expected: `Result: PASS` incluido `0013`. Córrelo 3 veces: el orden lleva `random()`, así que los
asserts deben ser de pertenencia/propiedad, nunca de posición exacta. Si alguno flakea, conviértelo
en invariante.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/0013_recipe_discoverer.test.sql
git commit -m "test: contratos pgTAP del descubridor"
```

---

### Task 3: Script de backfill de imágenes

**Files:**
- Create: `scripts/backfill-recipe-images.mjs`

**Contexto:** la Edge Function `ensure-recipe-image` recibe `{ recipeId }` y genera la imagen si falta
(la usa el cliente vía `supabase.functions.invoke`). Sigue el estilo de
`scripts/seed/generate-home-recipes.mjs` (env vars, throttle, log de progreso, re-ejecutable).

- [ ] **Step 1: Crear el script**

```js
// Rellena las imágenes que faltan en el catálogo llamando a ensure-recipe-image por lotes.
// Re-ejecutable: salta las que ya están listas.
//
// Uso (nube):
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon> \
//   [THROTTLE_MS=1500] [LIMIT=0] node scripts/backfill-recipe-images.mjs

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const throttleMs = Number(process.env.THROTTLE_MS ?? '1500');
const limit = Number(process.env.LIMIT ?? '0'); // 0 = todas; >0 para probar
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!url || !anonKey) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_ANON_KEY.');
  process.exit(1);
}

async function pendingRecipes() {
  const params = new URLSearchParams({
    select: 'id,title',
    reusable: 'eq.true',
    image_status: 'neq.ready',
    order: 'title',
  });
  const res = await fetch(`${url}/rest/v1/recipes?${params}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!res.ok) throw new Error(`listar recetas: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function ensureImage(recipeId) {
  const res = await fetch(`${url}/functions/v1/ensure-recipe-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ recipeId }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

const all = await pendingRecipes();
const targets = limit > 0 ? all.slice(0, limit) : all;
console.log(`Recetas sin imagen: ${all.length}. A procesar: ${targets.length}.`);

let ok = 0;
let failed = 0;
for (const [index, recipe] of targets.entries()) {
  try {
    await ensureImage(recipe.id);
    ok++;
    console.log(`  OK  [${index + 1}/${targets.length}] ${recipe.title}`);
  } catch (e) {
    failed++;
    console.error(`  XX  ${recipe.title} -> ${e.message}`);
  }
  await sleep(throttleMs);
}
console.log(`\nTOTAL: ${ok} encoladas, ${failed} fallidas.`);
```

**Nota importante para el implementador:** antes de dar la tarea por buena, verifica cómo autentica
`ensure-recipe-image` (lee `supabase/functions/ensure-recipe-image/index.ts`). Si exige un usuario
autenticado (JWT de usuario) y no basta la anon key, ajusta el script para usar
`SUPABASE_SERVICE_ROLE_KEY` o el secreto interno que use esa función, y documenta el cambio en la
cabecera de uso. No inventes: comprueba el código de la función.

- [ ] **Step 2: Probar en local con un lote pequeño**

Run (contra local, generando solo 2 para no gastar):
```
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<anon local> LIMIT=2 node scripts/backfill-recipe-images.mjs
```
Expected: procesa 2 recetas sin error de autenticación. Si la función local no tiene `FAL_KEY`, el
fallo será de generación (aceptable): lo que se valida aquí es que el script lista y llama bien.

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-recipe-images.mjs
git commit -m "chore: script de backfill de imágenes del catálogo"
```

---

### Task 4: Cliente — consulta del descubridor

**Files:**
- Modify: `apps/mobile/src/lib/recipes.ts`

- [ ] **Step 1: Añadir tipo y función**

En `apps/mobile/src/lib/recipes.ts`, junto a `listCatalogRecipes`:

```ts
export interface DiscoverCard {
  recipeId: string;
  title: string;
  description: string;
  imageUrl: string | null;
  imageStatus: ImageStatus;
  extras: number;
  ingredientNames: string[];
  warnAllergens: string[];
}

// Recetas que encajan con los ingredientes elegidos en el descubridor.
export async function discoverByIngredients(ingredientIds: string[]): Promise<DiscoverCard[]> {
  const { data, error } = await supabase.rpc('discover_recipes_by_ingredients', {
    p_ingredient_ids: ingredientIds,
    p_max_extra: 2,
    p_limit: 40,
  });
  if (error) throw error;
  return (data as DiscoverCard[]) ?? [];
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/lib/recipes.ts
git commit -m "feat: consulta del descubridor en el cliente"
```

---

### Task 5: Cliente — selector de ingredientes

**Files:**
- Create: `apps/mobile/src/features/discoverer/components/ingredient-multi-select.tsx`

**Contexto:** reutiliza `listIngredients()` de `apps/mobile/src/lib/ingredients.ts` (devuelve
`CatalogIngredient[]` con `id, name, category, image_url`). Para la sección "De tu despensa", usa la
función que ya lista la despensa del hogar en `apps/mobile/src/lib/pantry.ts` (localiza el listado
existente; NO crees una consulta nueva si ya hay una).

- [ ] **Step 1: Crear el componente**

Props:
```tsx
export function IngredientMultiSelect({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
})
```

Contenido:
- Buscador (`TextInput`) que filtra por nombre normalizado (usa `normalize` de `lib/ingredients.ts`).
- Sección "De tu despensa" arriba: los ingredientes del catálogo cuyo id esté en la despensa del
  hogar, como chips seleccionables.
- Lista del catálogo (`FlatList`) con miniatura, nombre y estado seleccionado (borde/color como los
  chips de `features/recipe-book/components/recipe-filters.tsx`).
- Cada pulsación llama a `onToggle(id)`.

Estilo: sigue las clases NativeWind ya usadas en el proyecto (`bg-card`, `border-card-border`,
`font-sans`, `text-body-md`, `px-stack-md`…). Sin emojis en botones.

- [ ] **Step 2: Verificar tipos y lint**

Run: `pnpm typecheck && pnpm --filter @recetas/mobile lint`
Expected: typecheck exit 0; lint SIN warnings nuevos (baseline de main: 0).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/discoverer/components/ingredient-multi-select.tsx
git commit -m "feat: selector multi-ingrediente del descubridor"
```

---

### Task 6: Cliente — visor reels y pantalla

**Files:**
- Create: `apps/mobile/src/features/discoverer/components/recipe-reel.tsx`
- Create: `apps/mobile/src/app/descubrir.tsx`
- Modify: `apps/mobile/src/app/(tabs)/recetas.tsx`
- Modify: `apps/mobile/src/app/_layout.tsx` (registrar la ruta `descubrir` si el layout las declara
  explícitamente; comprueba cómo están registradas `favoritos`/`historial` y sigue ese patrón)

- [ ] **Step 1: Crear la página del visor (`recipe-reel.tsx`)**

Componente de una card a pantalla completa:

```tsx
export function RecipeReel({
  card,
  height,
  saved,
  onSave,
  onOpen,
}: {
  card: DiscoverCard;
  height: number;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
})
```

- `View` con `style={{ height }}`, imagen de fondo (`expo-image`, `contentFit="cover"`), y si no hay
  imagen un fondo neutro (`bg-surface-container`).
- Degradado inferior para legibilidad: como el proyecto no tiene `expo-linear-gradient` instalado,
  usa una capa `View` con `bg-black/60` en la mitad inferior (NO añadas dependencias nuevas).
- Sobre el degradado: título (`text-display-lg`), descripción (`numberOfLines={3}`), y los 6 primeros
  de `card.ingredientNames` como chips, con un chip final `+N más` si hay más.
- Si `card.warnAllergens.length > 0`: banda visible con `Contiene: <lista>`.
- **Doble toque**: `Pressable` que envuelve la card; guarda un `useRef<number>` con el timestamp del
  último toque y, si el nuevo llega en menos de 300 ms, llama a `onSave()`. Un toque simple sobre el
  bloque de texto llama a `onOpen()`.
- Botón de guardar visible arriba a la derecha (icono `bookmark`/`bookmark-border`), llama a `onSave()`.

- [ ] **Step 2: Crear la pantalla `descubrir.tsx`**

Estado: `phase: 'select' | 'reel'`, `selected: Set<string>`, `cards: DiscoverCard[]`, `loading`,
`saved: Set<string>`.

- Fase `select`: `BackHeader` + `IngredientMultiSelect` + botón **Descubrir** (deshabilitado si
  `selected.size === 0`). Al pulsar: `discoverByIngredients([...selected])`, guarda `cards` y pasa a
  `reel`.
- Fase `reel`: `FlatList` vertical con `pagingEnabled`, `snapToInterval={height}`,
  `decelerationRate="fast"`, `showsVerticalScrollIndicator={false}`, donde `height` sale de
  `useWindowDimensions()` menos los insets que correspondan. Cada item renderiza `RecipeReel`.
- `ListFooterComponent`: página de cierre con "No hay más recetas con esos ingredientes" y botón
  "Cambiar ingredientes" que vuelve a `phase='select'`.
- Si `cards.length === 0` tras buscar: mensaje "Ninguna receta encaja con esos ingredientes" y botón
  para volver al selector.
- Guardar: `setFavorite(session.user.id, recipeId, true)` de `lib/user-recipes.ts`, con actualización
  optimista del `Set` local y reversión si falla (mismo patrón que `toggleSave` en
  `features/home/hooks/use-home.ts`).

- [ ] **Step 3: Entrada desde el tab Recetas**

En `apps/mobile/src/app/(tabs)/recetas.tsx`, añade sobre la lista (dentro del header de la sección
"Todas" o junto a las pestañas) un botón "Descubrir con ingredientes" que haga
`router.push('/descubrir')`. Mantén el estilo de los botones existentes del proyecto.

- [ ] **Step 4: Verificar tipos y lint**

Run: `pnpm typecheck && pnpm --filter @recetas/mobile lint`
Expected: typecheck exit 0; lint sin warnings nuevos.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/discoverer "apps/mobile/src/app/descubrir.tsx" "apps/mobile/src/app/(tabs)/recetas.tsx" "apps/mobile/src/app/_layout.tsx"
git commit -m "feat: visor de descubrimiento tipo reels"
```

---

### Task 7: Revisión y entrega

- [ ] `pnpm test:db` completo en verde (3 corridas, sin flaky por el `random()` del orden).
- [ ] `pnpm typecheck` y `expo lint` limpios.
- [ ] Revisión por agente del diff de la rama.
- [ ] PR y merge tras confirmación del usuario.
- [ ] `supabase db push` (RPC 0068).
- [ ] Ejecutar `scripts/backfill-recipe-images.mjs` contra la nube (~440 imágenes, ~1-2 €), con
      confirmación del usuario antes de lanzarlo.
- [ ] Build EAS de APK (incluye recetario + descubridor).
