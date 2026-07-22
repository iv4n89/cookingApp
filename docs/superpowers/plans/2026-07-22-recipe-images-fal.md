# Imágenes de receta con fal.ai + UX de carga — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generar imágenes de receta con fal.ai Flux schnell (solo para reutilizables), señalizar el estado con `recipes.image_status` y mostrar spinner mientras se genera / placeholder si no habrá imagen.

**Architecture:** Nueva columna `recipes.image_status` (`pending`|`ready`|`none`). `saveRecipe` la fija por `reusable` (chat → `none`, sin fal). El job de imagen (`recipe-image.ts`) llama a fal.ai, sube al bucket y marca `ready`/`none`. El cliente expone `image_status` en `getRecipe` y `recommended_recipes`, y un hook `useRecipeImage` sondea mientras `pending`. Solo muestran imagen: hero del detalle y tarjetas de Home (favoritos/historial no tienen imagen; chat siempre `none`).

**Tech Stack:** Supabase Postgres, Edge Functions (Deno/TS), fal.ai, Expo RN (TS).

**Rama:** `feat/recipe-images-fal` (desde `main`). Última migración en `main`: `0030`.

**Requisito externo:** `FAL_KEY` (cuenta fal.ai) en `supabase/functions/.env`. La da el usuario; sin ella la verificación e2e no se puede correr (se marca `none`).

**Sin infra de tests:** verificación con `supabase migration up`, `deno check`, `tsc --noEmit` y e2e (`saveRecipe`).

---

## File Structure

**Crear:**
- `supabase/migrations/0031_recipe_image_status.sql` — columna + backfill.
- `supabase/migrations/0032_recommended_recipes_image_status.sql` — RPC devuelve `image_status`.
- `apps/mobile/src/lib/recipe-image.ts` — hook `useRecipeImage`.

**Modificar:**
- `supabase/functions/_shared/recipe-image.ts` — proveedor fal.ai + escritura de `image_status`.
- `supabase/functions/_shared/recipes.ts` — `saveRecipe` fija `image_status` por `reusable`.
- `supabase/functions/_shared/recipe-pipeline.ts` — encolar imagen solo si reutilizable.
- `apps/mobile/src/lib/recipes.ts` — `Recipe.image_status` + `COLUMNS`; `RecommendedRecipe.image_status`.
- `apps/mobile/src/features/recipe-detail/components/recipe-hero.tsx` — usar el hook.
- `apps/mobile/src/components/recipe-card.tsx` — `RecipeCardData.imageStatus` + usar el hook.
- `apps/mobile/src/features/home/components/home-suggestions.tsx` — pasar `imageStatus`.

---

## Task 1: Columna `image_status`

**Files:** Create `supabase/migrations/0031_recipe_image_status.sql`

- [ ] **Step 1: Migración**

```sql
-- Estado de la imagen de la receta para la UI: 'pending' (generándose, el cliente sondea),
-- 'ready' (hay image_url), 'none' (no habrá: variante de chat o generación fallida -> placeholder).
alter table recipes add column image_status text not null default 'pending';
-- Backfill de las existentes: listo si ya hay imagen, si no 'none' (no reintentan).
update recipes set image_status = case when image_url is not null then 'ready' else 'none' end;
```

- [ ] **Step 2: Aplicar y verificar**

Run: `supabase migration up`
Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select image_status, count(*) from recipes group by image_status;"`
Expected: filas `ready` (~16) y `none` (~29), 0 `pending`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0031_recipe_image_status.sql
git commit -m "feat(db): recipes.image_status (pending/ready/none)"
```

---

## Task 2: `recommended_recipes` devuelve `image_status`

**Files:** Create `supabase/migrations/0032_recommended_recipes_image_status.sql`

- [ ] **Step 1: Migración (reescribe la función de 0028 añadiendo image_status)**

```sql
-- Añade image_status a la salida de recommended_recipes para que las tarjetas de Home puedan
-- mostrar spinner mientras la imagen se genera. Reescribe 0028 sin más cambios.
drop function if exists recommended_recipes(int, int, text, uuid[]);
create function recommended_recipes(
  p_limit int default 6,
  p_extra_limit int default 3,
  p_meal_type text default null,
  p_exclude uuid[] default '{}'
)
returns table (
  id uuid,
  title text,
  description text,
  image_url text,
  image_status text,
  prep_time_min int,
  cook_time_min int,
  tags text[],
  match_count int,
  missing_count int,
  bucket text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_exclude_allergens text[];
  v_require_diet text[];
  v_picked uuid[] := '{}';
  picked vector(768)[] := array[]::vector(768)[];
  e vector(768);
  n_main int := 0;
  n_buy int := 0;
  b text;
  too_similar boolean;
  r record;
begin
  select coalesce(array_agg(distinct m.allergen), '{}')
    into v_exclude_allergens
  from user_preferences up
  cross join lateral unnest(up.special_needs) as sn
  join (values
    ('Frutos secos','nuts'), ('Cacahuete','peanut'),
    ('Marisco','crustaceans'), ('Marisco','molluscs'),
    ('Pescado','fish'), ('Huevo','egg'), ('Leche','milk'), ('Soja','soy'),
    ('Sésamo','sesame'), ('Mostaza','mustard'), ('Apio','celery'), ('Lactosa','milk'),
    ('Gluten / celiaquía','gluten'), ('Fructosa','fructose'), ('Histamina','histamine'),
    ('Sorbitol','sorbitol'), ('Sin cerdo','pork'), ('Sin alcohol','alcohol'),
    ('Halal','pork'), ('Halal','alcohol'),
    ('Kosher','pork'), ('Kosher','crustaceans'), ('Kosher','molluscs')
  ) as m(need, allergen) on m.need = sn
  where up.user_id = v_uid;

  select coalesce(array_agg(distinct d.diet), '{}')
    into v_require_diet
  from user_preferences up
  cross join lateral unnest(up.food_prefs) as fp
  join (values
    ('Vegana','vegan'), ('Vegana','vegetarian'), ('Vegetariana','vegetarian')
  ) as d(pref, diet) on d.pref = fp
  where up.user_id = v_uid;

  v_exclude_allergens := coalesce(v_exclude_allergens, '{}');
  v_require_diet := coalesce(v_require_diet, '{}');

  for r in
    with pantry as (
      select distinct coalesce(i.canonical_id, i.id) as cid
      from pantry_items p
      join ingredients i on i.id = p.ingredient_id
      where p.user_id = v_uid and p.ingredient_id is not null
    ),
    staple as (
      select distinct coalesce(i.canonical_id, i.id) as cid
      from ingredients i
      where i.category in ('Especias y hierbas', 'Condimentos y edulcorantes', 'Aceites, vinagres y salsas')
    ),
    scored as (
      select rec.id, rec.title, rec.description, rec.image_url, rec.image_status, rec.prep_time_min,
             rec.cook_time_min, rec.tags, rec.embedding, rec.created_at,
             (p_meal_type is not null and rec.meal_types @> array[p_meal_type]) as slot_match,
             count(distinct x.iid) filter (where pantry.cid is not null)::int as mc,
             count(distinct x.iid) filter (where pantry.cid is null and staple.cid is null)::int as missing
      from recipes rec
      join lateral jsonb_array_elements(rec.ingredients) ing on true
      cross join lateral (select (ing->>'ingredient_id')::uuid as raw_iid) x0
      left join ingredients ri on ri.id = x0.raw_iid
      cross join lateral (select coalesce(ri.canonical_id, ri.id) as iid) x
      left join pantry on pantry.cid = x.iid
      left join staple on staple.cid = x.iid
      where x0.raw_iid is not null
        and rec.reusable
        and (cardinality(v_exclude_allergens) = 0
             or (rec.allergens is not null and not (rec.allergens && v_exclude_allergens)))
        and (cardinality(v_require_diet) = 0
             or (rec.diet is not null and rec.diet @> v_require_diet))
        and rec.id <> all(p_exclude)
      group by rec.id
    )
    select * from scored
    where mc >= 1 and missing <= 4
    order by (missing <= 1) desc, slot_match desc, missing asc, mc desc, created_at desc
  loop
    exit when n_main >= p_limit and n_buy >= p_extra_limit;
    b := case when r.missing <= 1 then 'pantry' else 'buy' end;
    if b = 'pantry' and n_main >= p_limit then continue; end if;
    if b = 'buy' and n_buy >= p_extra_limit then continue; end if;

    too_similar := false;
    if r.embedding is not null then
      foreach e in array picked loop
        if 1 - (r.embedding <=> e) > 0.9 then too_similar := true; exit; end if;
      end loop;
    end if;
    if too_similar then continue; end if;
    if r.embedding is not null then picked := picked || r.embedding; end if;

    id := r.id; title := r.title; description := r.description; image_url := r.image_url;
    image_status := r.image_status;
    prep_time_min := r.prep_time_min; cook_time_min := r.cook_time_min; tags := r.tags;
    match_count := r.mc; missing_count := r.missing; bucket := b;
    v_picked := v_picked || r.id;
    if b = 'pantry' then n_main := n_main + 1; else n_buy := n_buy + 1; end if;
    return next;
  end loop;

  if n_main = 0 then
    for r in
      select rec.id, rec.title, rec.description, rec.image_url, rec.image_status, rec.prep_time_min,
             rec.cook_time_min, rec.tags, rec.embedding, rec.created_at,
             (p_meal_type is not null and rec.meal_types @> array[p_meal_type]) as slot_match
      from recipes rec
      where rec.reusable
        and (cardinality(v_exclude_allergens) = 0
             or (rec.allergens is not null and not (rec.allergens && v_exclude_allergens)))
        and (cardinality(v_require_diet) = 0
             or (rec.diet is not null and rec.diet @> v_require_diet))
        and rec.id <> all(p_exclude)
        and rec.id <> all(v_picked)
      order by slot_match desc, rec.created_at desc
    loop
      exit when n_main >= p_limit;
      too_similar := false;
      if r.embedding is not null then
        foreach e in array picked loop
          if 1 - (r.embedding <=> e) > 0.9 then too_similar := true; exit; end if;
        end loop;
      end if;
      if too_similar then continue; end if;
      if r.embedding is not null then picked := picked || r.embedding; end if;
      id := r.id; title := r.title; description := r.description; image_url := r.image_url;
      image_status := r.image_status;
      prep_time_min := r.prep_time_min; cook_time_min := r.cook_time_min; tags := r.tags;
      match_count := 0; missing_count := 0; bucket := 'idea';
      n_main := n_main + 1;
      return next;
    end loop;
  end if;
end;
$$;

grant execute on function recommended_recipes(int, int, text, uuid[]) to authenticated;
```

- [ ] **Step 2: Aplicar y verificar**

Run: `supabase migration up`
Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\df recommended_recipes"` — firma `(int,int,text,uuid[])`, y smoke con un usuario:
```
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres <<SQL
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"30383ee5-26d4-4822-a373-4c4ed0144457"}';
select id, image_status from recommended_recipes(6, 3, null, '{}');
rollback;
SQL
```
Expected: filas con `image_status` poblado, sin error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0032_recommended_recipes_image_status.sql
git commit -m "feat(db): recommended_recipes devuelve image_status"
```

---

## Task 3: Proveedor fal.ai (`_shared/recipe-image.ts`)

**Files:** Modify `supabase/functions/_shared/recipe-image.ts`

- [ ] **Step 1: Reemplazar el archivo completo por:**

```ts
import { fetchWithTimeout } from './http.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Global del edge runtime de Supabase para trabajo en segundo plano tras responder.
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;

const BUCKET = 'recipe-images';
const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux/schnell';
const FAL_TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 2;

function imagePrompt(title: string): string {
  return (
    `${title}, plato de comida terminado y bien emplatado, fotografía cenital apetecible, ` +
    `fondo neutro claro, luz natural suave, sin texto, sin marca de agua`
  );
}

// Genera la imagen con fal.ai Flux schnell y devuelve la URL temporal del resultado.
async function falImageUrl(prompt: string): Promise<string> {
  const key = Deno.env.get('FAL_KEY');
  if (!key) throw new Error('FAL_KEY no configurada');
  const res = await fetchWithTimeout(
    FAL_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${key}` },
      body: JSON.stringify({
        prompt,
        image_size: 'landscape_4_3',
        num_inference_steps: 4,
        num_images: 1,
      }),
    },
    FAL_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`fal ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const url = data?.images?.[0]?.url;
  if (typeof url !== 'string') throw new Error('Respuesta de fal inesperada');
  return url;
}

// Genera la imagen de una receta reutilizable, la sube al bucket y fija image_status.
// Pensada para segundo plano. Garantiza terminar en 'ready' o 'none' (nunca deja 'pending').
export async function generateRecipeImage(
  supabase: SupabaseClient,
  recipeId: string,
  title: string,
): Promise<void> {
  const publicBase = Deno.env.get('PUBLIC_SUPABASE_URL');
  if (!publicBase) {
    await supabase.from('recipes').update({ image_status: 'none' }).eq('id', recipeId);
    return;
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const srcUrl = await falImageUrl(imagePrompt(title));
      const imgRes = await fetchWithTimeout(srcUrl, {}, FAL_TIMEOUT_MS);
      if (!imgRes.ok) throw new Error(`descarga imagen ${imgRes.status}`);
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      const path = `${recipeId}.jpg`;
      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (upload.error) throw upload.error;
      const url = `${publicBase}/storage/v1/object/public/${BUCKET}/${path}`;
      const { error } = await supabase
        .from('recipes')
        .update({ image_url: url, image_status: 'ready' })
        .eq('id', recipeId);
      if (error) throw error;
      return;
    } catch (e) {
      lastError = e;
    }
  }
  // Tras los reintentos, sin imagen: placeholder.
  await supabase.from('recipes').update({ image_status: 'none' }).eq('id', recipeId);
  console.error('recipe image:', lastError);
}

// Encola la generación en segundo plano. Solo debe llamarse para recetas reutilizables.
export function queueRecipeImage(supabase: SupabaseClient, id: unknown, title: unknown): void {
  if (typeof id !== 'string' || typeof title !== 'string') return;
  const task = generateRecipeImage(supabase, id, title).catch((e) => console.error('recipe image:', e));
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
}
```

- [ ] **Step 2: Verificar tipos**

Run: `deno check supabase/functions/_shared/recipe-image.ts`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/recipe-image.ts
git commit -m "feat(ai): imágenes de receta con fal.ai (Flux schnell) + image_status"
```

---

## Task 4: `saveRecipe` fija `image_status`; encolar solo reutilizables

**Files:** Modify `supabase/functions/_shared/recipes.ts`, `supabase/functions/_shared/recipe-pipeline.ts`

- [ ] **Step 1: `recipes.ts` — insertar image_status por reusable**

En `saveRecipe`, en el objeto de `.insert({...})`, tras la línea `reusable: recipe.reusable ?? true,` añade:

```ts
      image_status: (recipe.reusable ?? true) ? 'pending' : 'none',
```

- [ ] **Step 2: `recipe-pipeline.ts` — encolar imagen solo si reutilizable**

Sustituye:
```ts
  // Imagen de la receta en segundo plano: no bloquea la respuesta y se guarda para el futuro.
  queueRecipeImage(supabase, saved?.id, saved?.title);
```
por:
```ts
  // Imagen de la receta en segundo plano SOLO para reutilizables (las del chat, reusable=false,
  // van con placeholder para no gastar en fal). No bloquea la respuesta.
  if (!options.skipCache) queueRecipeImage(supabase, saved?.id, saved?.title);
```

(La siembra `index-recipe` guarda con `reusable` por defecto `true` → sigue encolando; no se toca.)

- [ ] **Step 3: Verificar tipos**

Run: `deno check supabase/functions/_shared/recipes.ts supabase/functions/_shared/recipe-pipeline.ts`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/recipes.ts supabase/functions/_shared/recipe-pipeline.ts
git commit -m "feat(ai): image_status por reusable; imagen fal solo para reutilizables"
```

---

## Task 5: Cliente — tipos, query y hook

**Files:** Modify `apps/mobile/src/lib/recipes.ts`; Create `apps/mobile/src/lib/recipe-image.ts`

- [ ] **Step 1: `lib/recipes.ts` — tipo y COLUMNS**

Añade el tipo de estado y `image_status` a `Recipe`. Tras `export type RecipeOrigin = ...` (o junto a los tipos), añade:
```ts
export type ImageStatus = 'pending' | 'ready' | 'none';
```
En la interfaz `Recipe`, añade tras `image_url: string | null;`:
```ts
  image_status: ImageStatus;
```
En `const COLUMNS = '...'` añade `image_status` a la lista (p.ej. tras `image_url`).
En la interfaz `RecommendedRecipe`, añade tras `image_url: string | null;`:
```ts
  image_status: ImageStatus;
```
(La RPC ya devuelve la columna; `recommendedRecipes` la mapea sin más cambios.)

- [ ] **Step 2: Crear el hook `apps/mobile/src/lib/recipe-image.ts`**

```ts
import { useEffect, useRef, useState } from 'react';

import { supabase } from './supabase';
import type { ImageStatus } from './recipes';

const POLL_MS = 1500;
const MAX_POLLS = 13; // ~20s de sondeo como tope de seguridad

// Resuelve la imagen de una receta: si está lista, su url; si se está generando ('pending'),
// sondea hasta que llegue ('ready') o se descarte ('none'); si no habrá, null. `pending`
// indica mostrar spinner.
export function useRecipeImage(
  recipeId: string,
  initialUrl: string | null,
  initialStatus: ImageStatus | null | undefined,
): { image: string | null; pending: boolean } {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [status, setStatus] = useState<ImageStatus>(initialUrl ? 'ready' : initialStatus ?? 'none');

  useEffect(() => {
    setUrl(initialUrl);
    setStatus(initialUrl ? 'ready' : initialStatus ?? 'none');
  }, [recipeId, initialUrl, initialStatus]);

  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    if (url || status !== 'pending') return;
    let polls = 0;
    const timer = setInterval(async () => {
      polls += 1;
      const { data } = await supabase
        .from('recipes')
        .select('image_url, image_status')
        .eq('id', recipeId)
        .maybeSingle();
      if (!active.current) return;
      const nextUrl = (data?.image_url as string | null) ?? null;
      const nextStatus = (data?.image_status as ImageStatus | null) ?? 'none';
      if (nextUrl) {
        setUrl(nextUrl);
        setStatus('ready');
        clearInterval(timer);
      } else if (nextStatus !== 'pending' || polls >= MAX_POLLS) {
        setStatus('none');
        clearInterval(timer);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [recipeId, url, status]);

  return { image: url, pending: !url && status === 'pending' };
}
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit`
Expected: puede fallar en consumidores que aún no pasan `image_status` (RecipeHero/RecipeCard/home-suggestions) — se arregla en la Task 6. Ningún error propio en `lib/recipes.ts`/`lib/recipe-image.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/lib/recipes.ts apps/mobile/src/lib/recipe-image.ts
git commit -m "feat(images): Recipe.image_status, RecommendedRecipe.image_status y hook useRecipeImage"
```

---

## Task 6: Cliente — hero y tarjetas usan el hook

**Files:** Modify `recipe-hero.tsx`, `recipe-card.tsx`, `home-suggestions.tsx`

- [ ] **Step 1: `recipe-hero.tsx`**

Reemplaza el archivo por:
```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, View } from 'react-native';

import { useRecipeImage } from '@/lib/recipe-image';
import type { Recipe } from '@/lib/recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Hero image at the top of the recipe detail: image when ready, spinner while it is being
// generated, placeholder when there won't be one.
export function RecipeHero({ recipe }: { recipe: Recipe }) {
  const { image, pending } = useRecipeImage(recipe.id, recipe.image_url, recipe.image_status);
  return (
    <View className="relative aspect-[3/2] w-full items-center justify-center bg-surface-container">
      {image ? (
        <Image source={image} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : pending ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <MaterialIcons name="restaurant-menu" size={48} color={colors['outline-variant']} />
      )}
    </View>
  );
}
```

- [ ] **Step 2: `recipe-card.tsx` — añadir `imageStatus` y usar el hook**

En `recipe-card.tsx`:
- Cambia el import de react-native para incluir `ActivityIndicator`:
  ```ts
  import { ActivityIndicator, Pressable, Text, View } from 'react-native';
  ```
- Añade el import del hook y el tipo:
  ```ts
  import { useRecipeImage } from '@/lib/recipe-image';
  import type { ImageStatus } from '@/lib/recipes';
  ```
- En `RecipeCardData`, añade tras `image: string | null;`:
  ```ts
    imageStatus: ImageStatus;
  ```
- Dentro de `RecipeCard`, antes del `return`, añade:
  ```ts
  const { image, pending } = useRecipeImage(recipe.id, recipe.image, recipe.imageStatus);
  ```
- Sustituye el bloque de imagen:
  ```tsx
        {recipe.image ? (
          <Image
            source={recipe.image}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
        ) : (
          <MaterialIcons name="restaurant-menu" size={40} color={colors['outline-variant']} />
        )}
  ```
  por:
  ```tsx
        {image ? (
          <Image source={image} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : pending ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <MaterialIcons name="restaurant-menu" size={40} color={colors['outline-variant']} />
        )}
  ```

- [ ] **Step 3: `home-suggestions.tsx` — pasar `imageStatus`**

En `toCardData` (en `home-suggestions.tsx`), en el objeto que devuelve, tras `image: recipe.image_url,` añade:
```ts
    imageStatus: recipe.image_status,
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit`
Expected: limpio salvo los 4 preexistentes de `_layout.tsx`. Nota: `ChatRecipeCard` no usa `RecipeCardData` (monta su propia tarjeta con `recipe.image_url`); las recetas del chat son `image_status='none'`, así que muestran placeholder sin cambios.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/recipe-detail/components/recipe-hero.tsx apps/mobile/src/components/recipe-card.tsx apps/mobile/src/features/home/components/home-suggestions.tsx
git commit -m "feat(images): hero y tarjetas de Home con spinner mientras se genera"
```

---

## Task 7: Verificación end-to-end

**Files:** ninguno.

- [ ] **Step 1: Type-checks**

Run: `deno check supabase/functions/_shared/recipe-image.ts supabase/functions/_shared/recipes.ts supabase/functions/_shared/recipe-pipeline.ts`
Run: `pnpm --filter @recetas/mobile exec tsc --noEmit` (solo errores de `_layout.tsx`).

- [ ] **Step 2: e2e con `FAL_KEY` (requiere la clave del usuario)**

Harness Deno en el scratchpad (no commitear) `verify-image.ts`:
```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { saveRecipe } from '/home/ibetanzos/dev/recetasApp/supabase/functions/_shared/recipes.ts';
import { queueRecipeImage } from '/home/ibetanzos/dev/recetasApp/supabase/functions/_shared/recipe-image.ts';

const supabase = createClient(Deno.env.get('SB_URL')!, Deno.env.get('SB_KEY')!);
const reusable = Deno.args[0] !== 'chat';
const saved = await saveRecipe(supabase, {
  title: 'Prueba imagen ' + Deno.args[0],
  description: 'test', source: 'generated', servings: 2, prep_time_min: 5, cook_time_min: 5,
  tags: ['prueba'], ingredients: [{ name: 'cebolla morada' }],
  steps: [{ order: 1, instruction: 'x', timerSeconds: null }], reusable,
} as never);
const id = (saved as { id: string }).id;
console.log('RECIPE_ID', id, 'reusable', reusable);
if (reusable) { queueRecipeImage(supabase, id, 'Tortilla de patatas'); await new Promise((r) => setTimeout(r, 8000)); }
```
Run (reutilizable):
```bash
set -a; source <(grep '^FAL_KEY=' supabase/functions/.env); set +a
SB_URL=http://127.0.0.1:54321 \
SB_KEY=$(supabase status --output json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).SERVICE_ROLE_KEY))") \
deno run --allow-net --allow-env <scratchpad>/verify-image.ts run1
```
Comprobar: `psql ... -c "select image_status, image_url is not null as tiene_url from recipes where title like 'Prueba imagen%';"`
Expected: la reutilizable → `image_status='ready'` y `tiene_url = t` (si `FAL_KEY` válida). Con `run1 chat` (reusable=false) → `image_status='none'`, `tiene_url=f`, sin llamada a fal.
Si no hay `FAL_KEY`: la reutilizable acaba en `none` (no bloquea el guardado) — verificar que no queda `pending`.

- [ ] **Step 3: Limpieza**

`psql ... -c "delete from recipes where title like 'Prueba imagen%';"` (borra también sus objetos de storage manualmente si quieres). El harness no se commitea.

---

## Notas de verificación (resumen)

- **DB:** `image_status` poblado; `recommended_recipes` lo devuelve.
- **Edge:** `deno check` limpio; e2e con `FAL_KEY` → reutilizable `ready`, chat `none`.
- **Cliente:** `tsc` limpio; en dev-client, receta reutilizable recién generada → spinner y luego imagen; chat → placeholder.
- **Fuera de alcance:** imágenes de ingredientes; regenerar las `none` viejas; palancas de coste de texto.
