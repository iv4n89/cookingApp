# Home "decisión de hoy" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la Home consuma un único DTO "decisión de hoy" (productos prioritarios por caducidad → receta destacada + alternativas → faltantes de compra), compuesto en backend a partir del motor determinista ya existente.

**Architecture:** Una RPC nueva `household_today_decision` envuelve, sin duplicar lógica, `household_recommendation_decision` (decisión) y `household_expiration_snapshot` (caducidad), y une los `recipeId` con `recipes` para el pintado. El móvil solo consume vía un wrapper en `lib` y una Home reescrita. Se entrega en dos PRs: A (backend + DTO) y B (móvil).

**Tech Stack:** Postgres/pgTAP (Supabase), TypeScript (`@recetas/shared`), React Native + Expo Router + NativeWind.

Spec: `docs/superpowers/specs/2026-07-24-home-today-decision-design.md`.

---

## PR A — Backend `household_today_decision` + DTO

Rama: `feat/home-today-decision` (ya creada; contiene el spec).

### File Structure (PR A)

- Create: `supabase/migrations/0054_household_today_decision.sql` — la RPC compositora.
- Create: `supabase/tests/0009_household_today_decision.test.sql` — contratos pgTAP.
- Modify: `packages/shared/src/types.ts` — DTO `TodayDecision` y anidados.

---

### Task A1: DTO `TodayDecision` en `@recetas/shared`

**Files:**
- Modify: `packages/shared/src/types.ts` (añadir al final, tras `RecommendationDecision`).

- [ ] **Step 1: Añadir los tipos**

Añade al final de `packages/shared/src/types.ts`:

```ts
export type TodayPriorityStatus = "priority" | "consume_soon";

export interface TodayPriorityProduct {
  name: string;
  status: TodayPriorityStatus;
  estimatedDate: string | null;
  confidence: "high" | "medium" | "low";
}

export interface TodayRecipeCard {
  recipeId: string;
  title: string;
  imageUrl: string | null;
  imageStatus: "pending" | "ready" | "none";
  mode: RecommendationMode;
  missingIngredientCount: number;
  reasons: string[];
}

export interface TodayShoppingItem {
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
}

export interface TodayDecision {
  policyVersion: string;
  mealType: RecommendationMealType | null;
  decisionReason: RecommendationDecision["decisionReason"];
  priorityProducts: TodayPriorityProduct[];
  featured: TodayRecipeCard | null;
  alternatives: TodayRecipeCard[];
  shoppingMissing: TodayShoppingItem[];
}
```

- [ ] **Step 2: Typecheck del paquete shared**

Run: `pnpm --filter @recetas/shared exec tsc --noEmit -p tsconfig.json`
Expected: PASS (sin salida de error).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: añadir DTO TodayDecision a shared"
```

---

### Task A2: Migración `household_today_decision`

**Files:**
- Create: `supabase/migrations/0054_household_today_decision.sql`

Notas de contrato (verificadas contra el código):
- `household_recommendation_decision(p_meal_type text, p_alternative_limit integer)` devuelve jsonb con `candidates[]` (cada uno `recipeId`, `mode`, `rank`, `score.missingIngredientCount`, `reasonCodes[]`, `missingIngredients[]`), `selectedRecipeId`, `decisionReason`, `mealType`, `policyVersion`.
- `household_expiration_snapshot()` devuelve tabla con `ingredient_name`, `status`, `confidence`, `acquired_at`, `min_days`, `age_days`.
- Ambas son `security definer` y resuelven identidad por `auth.uid()`/`current_household_id()`; la envoltura las llama sin pasar identidad.

- [ ] **Step 1: Escribir la migración**

Crea `supabase/migrations/0054_household_today_decision.sql`:

```sql
-- Compositor de la "decisión de hoy": une decisión determinista, caducidad y datos de pintado.
-- No duplica lógica: delega en household_recommendation_decision y household_expiration_snapshot.

create function public.household_today_decision(
  p_meal_type text default null,
  p_alternative_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_decision jsonb;
  v_priority jsonb;
  v_cards jsonb;
  v_featured jsonb;
  v_alternatives jsonb;
  v_shopping jsonb;
begin
  -- 1) Decisión determinista (valida auth/hogar internamente y lanza si falla).
  v_decision := public.household_recommendation_decision(p_meal_type, p_alternative_limit);

  -- 2) Productos prioritarios: priority antes que consume_soon, luego más antiguos primero.
  select coalesce(jsonb_agg(product order by rank_key, age_days desc), '[]'::jsonb)
  into v_priority
  from (
    select
      jsonb_build_object(
        'name', s.ingredient_name,
        'status', s.status,
        'estimatedDate', case
          when s.acquired_at is not null and s.min_days is not null
          then (s.acquired_at + make_interval(days => s.min_days))
          else null
        end,
        'confidence', s.confidence
      ) as product,
      case s.status when 'priority' then 0 when 'consume_soon' then 1 else 2 end as rank_key,
      s.age_days
    from public.household_expiration_snapshot() s
    where s.status in ('priority', 'consume_soon')
  ) ranked;

  -- 3) Tarjetas de receta: une cada candidata con su fila de recipes para el pintado.
  select coalesce(jsonb_agg(card order by (candidate->>'rank')::int), '[]'::jsonb)
  into v_cards
  from jsonb_array_elements(v_decision->'candidates') as candidate
  join public.recipes r on r.id = (candidate->>'recipeId')::uuid
  cross join lateral jsonb_build_object(
    'recipeId', candidate->>'recipeId',
    'title', r.title,
    'imageUrl', r.image_url,
    'imageStatus', r.image_status,
    'mode', candidate->>'mode',
    'missingIngredientCount', coalesce((candidate->'score'->>'missingIngredientCount')::int, 0),
    'reasons', candidate->'reasonCodes'
  ) as card;

  v_featured := v_cards->0;
  v_alternatives := coalesce((
    select jsonb_agg(value order by ordinality)
    from jsonb_array_elements(v_cards) with ordinality
    where ordinality > 1
  ), '[]'::jsonb);

  -- 4) Compra: faltantes de las candidatas shop_then_cook, deduplicados por nombre.
  select coalesce(jsonb_agg(distinct_item), '[]'::jsonb)
  into v_shopping
  from (
    select distinct on (lower(missing->>'name'))
      jsonb_build_object(
        'ingredientId', missing->'ingredientId',
        'name', missing->>'name',
        'quantity', missing->'requiredQuantity',
        'unit', missing->>'unit'
      ) as distinct_item
    from jsonb_array_elements(v_decision->'candidates') as candidate
    cross join jsonb_array_elements(candidate->'missingIngredients') as missing
    where candidate->>'mode' = 'shop_then_cook'
    order by lower(missing->>'name')
  ) deduped;

  return jsonb_build_object(
    'policyVersion', v_decision->>'policyVersion',
    'mealType', v_decision->'mealType',
    'decisionReason', v_decision->>'decisionReason',
    'priorityProducts', coalesce(v_priority, '[]'::jsonb),
    'featured', v_featured,
    'alternatives', v_alternatives,
    'shoppingMissing', coalesce(v_shopping, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.household_today_decision(text, integer) from public, anon;
grant execute on function public.household_today_decision(text, integer) to authenticated;
```

- [ ] **Step 2: Aplicar la migración desde cero**

Run: `supabase db reset --local`
Expected: aplica hasta `0054_household_today_decision.sql` sin errores (`Finished supabase db reset`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0054_household_today_decision.sql
git commit -m "feat: RPC household_today_decision que compone la decisión de hoy"
```

---

### Task A3: Contratos pgTAP

**Files:**
- Create: `supabase/tests/0009_household_today_decision.test.sql`

- [ ] **Step 1: Escribir el test**

Crea `supabase/tests/0009_household_today_decision.test.sql`. Reproduce el patrón de `0008`/`0005` (usuarios en `auth.users`, hogar por trigger, `set_config('request.jwt.claim.sub', ...)`). Fuerza un lote en estado `priority` con `purchased_at` antiguo y una receta reutilizable que lo usa.

```sql
begin;

select plan(9);

select has_function(
  'public', 'household_today_decision', array['text', 'integer'],
  'Existe la RPC compositora de la decisión de hoy'
);

select ok(
  has_function_privilege('authenticated', 'public.household_today_decision(text,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.household_today_decision(text,integer)', 'EXECUTE'),
  'Solo authenticated puede ejecutarla'
);

-- Fixtures: dueño + un ingrediente canónico con perfil de caducidad forzado a priority.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000901',
  'authenticated', 'authenticated', 'today-owner@example.test', 'not-used', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

select set_config(
  'test.today_household',
  (select household_id::text from public.household_members where user_id = '00000000-0000-0000-0000-000000000901'),
  true
);

insert into public.user_preferences (user_id, food_prefs, special_needs, notes)
values ('00000000-0000-0000-0000-000000000901', '{}', '{}', '');

-- Perfil de caducidad corto para forzar priority con un lote de hace 30 días.
insert into public.expiration_profiles (id, min_days, max_days, confidence, priority_eligible, source_id, source_ref)
values ('today-fresh', 5, 60, 'high', true, 'test', 'today');

insert into public.ingredient_expiration_profiles (ingredient_id, profile_id, match_type)
values (
  (select id from public.ingredients where normalized_name = 'manzana golden'),
  'today-fresh', 'direct'
);

insert into public.pantry_items (id, user_id, household_id, ingredient_id, name, quantity, unit, category)
values (
  '00000000-0000-0000-0000-000000009101',
  '00000000-0000-0000-0000-000000000901',
  current_setting('test.today_household')::uuid,
  (select id from public.ingredients where normalized_name = 'manzana golden'),
  'Manzana golden', 2, 'ud', 'Frutas'
);

insert into public.pantry_batches (
  id, household_id, pantry_item_id, ingredient_id, name, category, unit,
  initial_quantity, remaining_quantity, source, purchased_at
) values (
  '00000000-0000-0000-0000-000000009201',
  current_setting('test.today_household')::uuid,
  '00000000-0000-0000-0000-000000009101',
  (select id from public.ingredients where normalized_name = 'manzana golden'),
  'Manzana golden', 'Frutas', 'ud', 2, 2, 'manual', current_timestamp - interval '30 days'
);

insert into public.recipes (id, title, source, reusable, image_status, ingredients, meal_types)
values (
  '00000000-0000-0000-0000-000000009301', 'Compota de manzana', 'generated', true, 'none',
  jsonb_build_array(jsonb_build_object(
    'ingredient_id', (select id from public.ingredients where normalized_name = 'manzana golden'),
    'name', 'Manzana golden', 'quantity', 1, 'unit', 'ud'
  )), array['cena']
);

do $$ begin
  perform public.upsert_recipe_season_profile(
    '00000000-0000-0000-0000-000000009301', array['summer'], 'high', 'curated', 'test-v1'
  );
end; $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- La manzana vieja aparece como producto prioritario.
select ok(
  public.household_today_decision('cena', 5)->'priorityProducts' @> jsonb_build_array(
    jsonb_build_object('name', 'Manzana golden', 'status', 'priority')
  ),
  'El producto próximo a caducar aparece como prioritario'
);

select is(
  jsonb_typeof(public.household_today_decision('cena', 5)->'priorityProducts'),
  'array',
  'priorityProducts es siempre un array'
);

-- La receta que aprovecha la manzana es la destacada.
select is(
  public.household_today_decision('cena', 5)->'featured'->>'recipeId',
  '00000000-0000-0000-0000-000000009301',
  'La receta que usa el prioritario es la destacada'
);

select is(
  public.household_today_decision('cena', 5)->'featured'->>'title',
  'Compota de manzana',
  'La destacada trae datos de pintado (título)'
);

select is(
  public.household_today_decision('cena', 5)->'featured'->>'mode',
  'cook_now',
  'Con el ingrediente en despensa la destacada es cook_now'
);

-- Con básicos en despensa no faltan ingredientes de compra.
select is(
  jsonb_typeof(public.household_today_decision('cena', 5)->'shoppingMissing'),
  'array',
  'shoppingMissing es siempre un array'
);

-- Restricción no soportada: cierra sin destacada.
update public.user_preferences
set special_needs = array['Halal']
where user_id = '00000000-0000-0000-0000-000000000901';

select is(
  public.household_today_decision('cena', 5)->>'decisionReason',
  'unsupported_household_restriction',
  'Una restricción no soportada corta la decisión'
);

select ok(
  public.household_today_decision('cena', 5)->'featured' = 'null'::jsonb
  or public.household_today_decision('cena', 5)->'featured' is null,
  'Sin candidata segura, featured es null'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Ejecutar la suite**

Run: `pnpm test:db`
Expected: `0009_household_today_decision.test.sql ... ok`, `All tests successful`, `Result: PASS`.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/0009_household_today_decision.test.sql
git commit -m "test: contratos pgTAP de household_today_decision"
```

---

### Task A4: PR A + revisión

- [ ] **Step 1: Push y PR**

```bash
git push -u origin feat/home-today-decision
gh pr create --title "feat: backend household_today_decision (Home decisión de hoy)" --body "RPC compositora + DTO TodayDecision + pgTAP. Cierra la parte backend de la Fase 2 (Home). Spec y plan en docs/superpowers."
```

- [ ] **Step 2: Revisión** con agente `code-reviewer` sobre el diff. Corregir hallazgos en la misma rama y re-revisar.
- [ ] **Step 3: Merge con confirmación del usuario** (squash + borrar rama), luego `git switch main && git pull`.

---

## PR B — Móvil: Home reescrita consumiendo el DTO

Rama nueva desde `main` (tras mergear PR A): `feat/home-today-decision-ui`.

### File Structure (PR B)

- Modify: `apps/mobile/src/lib/recipes.ts` — wrapper `todayDecision()` + reexport de tipos.
- Rewrite: `apps/mobile/src/features/home/hooks/use-home.ts` — consume el DTO.
- Create: `apps/mobile/src/features/home/components/priority-products-strip.tsx`
- Create: `apps/mobile/src/features/home/components/featured-recipe-card.tsx`
- Create: `apps/mobile/src/features/home/components/shopping-missing-card.tsx`
- Create: `apps/mobile/src/features/home/today-reasons.ts` — traducción `reasonCodes` → español.
- Modify: `apps/mobile/src/app/(tabs)/index.tsx` — nuevo layout.
- Retirar de la Home el uso de `home-suggestions.tsx`, `pantry-summary-card.tsx`, `quick-add-card.tsx` (los ficheros pueden quedar si se usan en otra vista; verificar con grep antes de borrar).

---

### Task B1: Wrapper cliente `todayDecision`

**Files:**
- Modify: `apps/mobile/src/lib/recipes.ts`

- [ ] **Step 1: Añadir el wrapper**

En `apps/mobile/src/lib/recipes.ts` añade el import de tipos al principio y la función junto a `recommendedRecipes`:

```ts
import type { TodayDecision } from '@recetas/shared';

// Decisión de hoy compuesta en backend: productos prioritarios, receta destacada,
// alternativas y faltantes de compra. `mealType` es la franja horaria actual.
export async function todayDecision(mealType: MealType): Promise<TodayDecision | null> {
  const { data, error } = await supabase.rpc('household_today_decision', {
    p_meal_type: mealType,
    p_alternative_limit: 5,
  });
  if (error) throw error;
  return (data as TodayDecision) ?? null;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/lib/recipes.ts
git commit -m "feat: wrapper cliente todayDecision"
```

---

### Task B2: Traducción de razones

**Files:**
- Create: `apps/mobile/src/features/home/today-reasons.ts`

- [ ] **Step 1: Crear el mapa**

```ts
import type { RecommendationReasonCode } from '@recetas/shared';

// Human-readable Spanish label per reason code, for the featured recipe's "why".
const LABELS: Record<RecommendationReasonCode, string> = {
  ready_from_pantry: 'Lista con lo que tienes',
  uses_priority_ingredients: 'Aprovecha productos a punto de caducar',
  uses_consume_soon_ingredients: 'Aprovecha productos a consumir pronto',
  seasonal_fit: 'De temporada',
  meal_type_fit: 'Encaja con la franja',
  requires_shopping: 'Necesita comprar algo',
  unknown_ingredient: '',
  unsupported_unit: '',
};

export function reasonLabels(codes: string[]): string[] {
  return codes.map((code) => LABELS[code as RecommendationReasonCode] ?? '').filter(Boolean);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit -p tsconfig.json` → PASS.

```bash
git add apps/mobile/src/features/home/today-reasons.ts
git commit -m "feat: etiquetas en español de las razones de recomendación"
```

---

### Task B3: `PriorityProductsStrip`

**Files:**
- Create: `apps/mobile/src/features/home/components/priority-products-strip.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import { ScrollView, Text, View } from 'react-native';

import type { TodayPriorityProduct } from '@recetas/shared';

import { colors } from '@recetas/theme/tokens';

// Horizontal strip of products to consume soon. Red dot = priority, amber = consume_soon.
export function PriorityProductsStrip({ products }: { products: TodayPriorityProduct[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-stack-md px-container-padding">
      {products.map((product, i) => (
        <View
          key={i}
          className="flex-row items-center gap-stack-sm border border-outline-variant bg-surface-container-low px-stack-lg py-gutter">
          <View
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: product.status === 'priority' ? colors.error : colors.tertiary }}
          />
          <Text className="font-sans-medium text-body-md text-on-surface">{product.name}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit -p tsconfig.json` → PASS.

```bash
git add apps/mobile/src/features/home/components/priority-products-strip.tsx
git commit -m "feat: tira de productos a consumir en la Home"
```

---

### Task B4: `FeaturedRecipeCard`

**Files:**
- Create: `apps/mobile/src/features/home/components/featured-recipe-card.tsx`

- [ ] **Step 1: Crear el componente** (reutiliza `useRecipeImage` como `RecipeCard`)

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { TodayRecipeCard } from '@recetas/shared';
import { useRecipeImage } from '@/lib/recipe-image';
import { reasonLabels } from '@/features/home/today-reasons';

import { colors } from '@recetas/theme/tokens';

export function FeaturedRecipeCard({ recipe, onPress }: { recipe: TodayRecipeCard; onPress: () => void }) {
  const { image, pending } = useRecipeImage(recipe.recipeId, recipe.imageUrl, recipe.imageStatus);
  const ready = recipe.mode === 'cook_now';
  const reasons = reasonLabels(recipe.reasons);
  return (
    <Pressable onPress={onPress} className="mx-container-padding overflow-hidden rounded-xl border border-card-border bg-card">
      {image || pending ? (
        <View className="h-64 w-full items-center justify-center bg-surface-container">
          {image ? (
            <Image source={image} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      ) : null}
      <View className="gap-stack-md p-stack-lg">
        <View className="flex-row items-center gap-stack-sm bg-tertiary-fixed self-start px-stack-md py-stack-sm">
          <MaterialIcons name={ready ? 'restaurant' : 'shopping-cart'} size={14} color={colors['on-tertiary-fixed']} />
          <Text className="font-mono-medium text-label-sm text-on-tertiary-fixed">
            {ready ? 'LISTA PARA COCINAR' : `TE FALTA${recipe.missingIngredientCount === 1 ? '' : 'N'} ${recipe.missingIngredientCount}`}
          </Text>
        </View>
        <Text className="font-sans-bold text-headline-sm text-primary">{recipe.title}</Text>
        {reasons.length ? (
          <Text className="font-sans text-body-md text-on-surface-variant">{reasons.join(' · ')}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit -p tsconfig.json` → PASS.

```bash
git add apps/mobile/src/features/home/components/featured-recipe-card.tsx
git commit -m "feat: tarjeta destacada 'cocina esto hoy'"
```

---

### Task B5: `ShoppingMissingCard`

**Files:**
- Create: `apps/mobile/src/features/home/components/shopping-missing-card.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { TodayShoppingItem } from '@recetas/shared';

import { colors } from '@recetas/theme/tokens';

export function ShoppingMissingCard({
  items,
  adding,
  added,
  onAdd,
}: {
  items: TodayShoppingItem[];
  adding: boolean;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <View className="mx-container-padding gap-stack-md border border-outline-variant bg-surface-container-lowest p-stack-lg">
      {items.map((item, i) => (
        <View key={i} className="flex-row items-center justify-between">
          <Text className="font-sans text-body-lg text-on-surface">{item.name}</Text>
          {item.quantity != null ? (
            <Text className="font-mono text-label-md text-on-surface-variant">
              {item.quantity} {item.unit ?? ''}
            </Text>
          ) : null}
        </View>
      ))}
      <Pressable
        onPress={onAdd}
        disabled={adding || added}
        className={`flex-row items-center justify-center gap-stack-md bg-primary py-gutter ${adding || added ? 'opacity-60' : ''}`}>
        {adding ? (
          <ActivityIndicator color={colors['on-primary']} />
        ) : (
          <MaterialIcons name={added ? 'check' : 'add-shopping-cart'} size={18} color={colors['on-primary']} />
        )}
        <Text className="font-mono-medium text-label-md tracking-widest text-on-primary">
          {added ? 'AÑADIDO' : 'AÑADIR A LA COMPRA'}
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit -p tsconfig.json` → PASS.

```bash
git add apps/mobile/src/features/home/components/shopping-missing-card.tsx
git commit -m "feat: tarjeta de faltantes de compra en la Home"
```

---

### Task B6: Reescribir `useHome`

**Files:**
- Rewrite: `apps/mobile/src/features/home/hooks/use-home.ts`

- [ ] **Step 1: Reescribir el hook**

Sustituye el contenido de `apps/mobile/src/features/home/hooks/use-home.ts` por:

```ts
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import type { TodayDecision } from '@recetas/shared';
import { useSession } from '@/lib/auth';
import { ensureRecipeImage } from '@/lib/recipe-image';
import { addIngredientsToShopping, todayDecision } from '@/lib/recipes';
import { currentMealType, greeting } from '@/features/home/meal-time';
import { listFavorites, setFavorite } from '@/lib/user-recipes';

// Home data: the composed "today decision" (priority products, featured recipe, alternatives,
// shopping-missing). Refetches on focus; exposes the save toggle and the add-to-shopping action.
export function useHome() {
  const { session } = useSession();
  const [decision, setDecision] = useState<TodayDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [meal, setMeal] = useState(() => currentMealType(new Date()));
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const savingIds = useRef<Set<string>>(new Set());
  const imageRequested = useRef<Set<string>>(new Set());
  const [addingShopping, setAddingShopping] = useState(false);
  const [addedShopping, setAddedShopping] = useState(false);

  // Kick off lazy image generation for the featured recipe and alternatives that lack one.
  const queueImages = useCallback((data: TodayDecision) => {
    const cards = [data.featured, ...data.alternatives].filter(Boolean) as NonNullable<TodayDecision['featured']>[];
    cards.forEach((card) => {
      if (card.imageUrl || card.imageStatus === 'pending') return;
      if (imageRequested.current.has(card.recipeId)) return;
      imageRequested.current.add(card.recipeId);
      ensureRecipeImage(card.recipeId).catch(() => {});
    });
  }, []);

  const fetchDecision = useCallback(
    (mealType: ReturnType<typeof currentMealType>) => {
      return todayDecision(mealType).then((data) => {
        if (data) queueImages(data);
        return data;
      });
    },
    [queueImages],
  );

  const load = useCallback(() => {
    let active = true;
    const mealType = currentMealType(new Date());
    setMeal(mealType);
    setLoading(true);
    setAddedShopping(false);
    fetchDecision(mealType)
      .then((data) => {
        if (active) setDecision(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    listFavorites()
      .then((favorites) => {
        if (active) setSaved(new Set(favorites.map((favorite) => favorite.id)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [fetchDecision]);

  useFocusEffect(load);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    const mealType = currentMealType(new Date());
    setMeal(mealType);
    try {
      const data = await fetchDecision(mealType);
      if (data) setDecision(data);
    } catch {
      // ignored; the user can retry
    } finally {
      setRefreshing(false);
    }
  }

  async function toggleSave(id: string) {
    if (!session || savingIds.current.has(id)) return;
    savingIds.current.add(id);
    const wasSaved = saved.has(id);
    setSaved((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      await setFavorite(session.user.id, id, !wasSaved);
    } catch {
      setSaved((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(id);
        else next.delete(id);
        return next;
      });
    } finally {
      savingIds.current.delete(id);
    }
  }

  async function addShoppingMissing() {
    const items = decision?.shoppingMissing ?? [];
    if (!session || addingShopping || addedShopping || items.length === 0) return;
    setAddingShopping(true);
    try {
      await addIngredientsToShopping(
        items.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit, substitutions: [] })),
      );
      setAddedShopping(true);
    } catch {
      // ignored; the user can retry
    } finally {
      setAddingShopping(false);
    }
  }

  return {
    decision,
    loading,
    refreshing,
    refresh,
    meal,
    greetingText: greeting(new Date()),
    saved,
    toggleSave,
    addingShopping,
    addedShopping,
    addShoppingMissing,
  };
}
```

Nota: `addIngredientsToShopping` espera objetos `RecipeIngredient` (`{ name, quantity, unit, substitutions }`); `quantity`/`unit` aceptan `null`. Verificar la firma en `apps/mobile/src/lib/recipes.ts` y ajustar si difiere.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @recetas/mobile exec tsc --noEmit -p tsconfig.json`
Expected: PASS (fallará donde `(tabs)/index.tsx` aún use la API vieja; se corrige en B7).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/home/hooks/use-home.ts
git commit -m "feat: useHome consume la decisión de hoy"
```

---

### Task B7: Nuevo layout de la Home

**Files:**
- Modify: `apps/mobile/src/app/(tabs)/index.tsx`

- [ ] **Step 1: Reescribir el render** usando el hook y los componentes nuevos

Estructura objetivo del `ScrollView` (dentro del `SafeAreaView` + `RefreshControl` existentes):

```tsx
// imports nuevos:
// import { PriorityProductsStrip } from '@/features/home/components/priority-products-strip';
// import { FeaturedRecipeCard } from '@/features/home/components/featured-recipe-card';
// import { ShoppingMissingCard } from '@/features/home/components/shopping-missing-card';
// import { HomeSectionHeader } from '@/features/home/components/home-section-header';

const {
  decision, loading, refreshing, refresh, meal, greetingText,
  saved, toggleSave, addingShopping, addedShopping, addShoppingMissing,
} = useHome();
const openRecipe = (id: string) => router.push({ pathname: '/receta/[id]', params: { id } });
const priority = decision?.priorityProducts ?? [];
const featured = decision?.featured ?? null;
const alternatives = decision?.alternatives ?? [];
const shopping = decision?.shoppingMissing ?? [];

// dentro del ScrollView, en orden:
// 1) saludo + HomeAskInput (se conservan)
// 2) {priority.length > 0 && (<><HomeSectionHeader title="Productos a consumir" actionLabel="VER TODO" onAction={() => router.push('/alacena')} /><PriorityProductsStrip products={priority} /></>)}
// 3) <HomeSectionHeader title={priority.length ? 'Cocina esto hoy' : `Ideas para tu ${meal}`} />
//    {loading ? <ActivityIndicator/> : featured ? <FeaturedRecipeCard recipe={featured} onPress={() => openRecipe(featured.recipeId)} /> : <Text>mensaje según decision?.decisionReason</Text>}
// 4) {alternatives.length > 0 && (<><HomeSectionHeader title="Otras ideas" />{alternatives.map(a => <RecipeCard ... />)}</>)}
//    (mapear TodayRecipeCard -> RecipeCardData: id=recipeId, image=imageUrl, imageStatus, badgeIcon/badge según mode/missingIngredientCount, title, description='', tags=[])
// 5) {shopping.length > 0 && (<><HomeSectionHeader title="Te falta para cocinar" /><ShoppingMissingCard items={shopping} adding={addingShopping} added={addedShopping} onAdd={addShoppingMissing} /></>)}
// 6) AskAiModal (se conserva)
```

Mensajes de estado vacío según `decision?.decisionReason`:
- `no_safe_candidate`: "No encontramos una receta segura con tu despensa y preferencias."
- `unsupported_household_restriction`: "Tienes una restricción que aún no sabemos manejar; revisa tus preferencias."

- [ ] **Step 2: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/app/(tabs)/index.tsx
git commit -m "feat: reorganizar la Home alrededor de la decisión de hoy"
```

---

### Task B8: Prueba en dispositivo + PR

- [ ] **Step 1: Recorrido manual** con la dev build (servidores locales levantados): con un producto próximo a caducar en la despensa, aparece en "Productos a consumir" y la receta que lo usa sale como "Cocina esto hoy"; el botón de compra añade los faltantes; pull-to-refresh y favoritos funcionan.
- [ ] **Step 2: Push, PR y revisión** con `code-reviewer`. Corregir en la rama y re-revisar.
- [ ] **Step 3: Merge con confirmación del usuario** (squash + borrar rama).

---

### Task B9: Actualizar `PROJECT_STATUS.md`

- [ ] Marcar la Fase 2 como completada (Home consume el motor) y fijar como siguiente trabajo la Fase 3 (motor conversacional). Rama `docs/*`, PR y merge.
