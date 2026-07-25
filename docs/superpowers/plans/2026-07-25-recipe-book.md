# Recetario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un tab "Recetas" donde explorar el catálogo (búsqueda por nombre + filtros de momento y dieta, scroll infinito) y ver las recetas guardadas.

**Architecture:** Solo cliente. La RLS `recipes_select_authenticated` ya permite listar el catálogo, así que se consulta `recipes` directamente con paginación `.range()`. Reutiliza `RecipeCard` y el hook de favoritos existentes.

**Tech Stack:** Expo Router, React Native, NativeWind, Supabase JS.

Spec: `docs/superpowers/specs/2026-07-25-recipe-book-design.md`. Rama: `feat/recipe-book`.

---

## Estructura de ficheros

- Modify `apps/mobile/src/lib/recipes.ts` — `RecipeListFilters` + `listCatalogRecipes()`.
- Create `apps/mobile/src/features/recipe-book/hooks/use-recipe-book.ts` — filtros, paginación, lista acumulada.
- Create `apps/mobile/src/features/recipe-book/components/recipe-filters.tsx` — buscador + chips.
- Create `apps/mobile/src/app/(tabs)/recetas.tsx` — pantalla con Todas | Guardadas.
- Modify `apps/mobile/src/app/(tabs)/_layout.tsx` — registrar el tab.

---

### Task 1: Consulta paginada del catálogo

**Files:**
- Modify: `apps/mobile/src/lib/recipes.ts`

- [ ] **Step 1: Añadir tipos y la función de listado**

En `apps/mobile/src/lib/recipes.ts`, tras `tasteRecommendations` (antes de `getRecipe`), añade:

```ts
export interface RecipeListFilters {
  search?: string;
  mealType?: MealType | null;
  diet?: 'vegetarian' | 'vegan' | null;
}

export const RECIPE_PAGE_SIZE = 20;

// Catálogo navegable del recetario: solo recetas reutilizables (las del chat son efímeras),
// ordenadas por título para que la paginación sea estable entre páginas.
export async function listCatalogRecipes(
  filters: RecipeListFilters,
  page: number,
): Promise<Recipe[]> {
  const from = page * RECIPE_PAGE_SIZE;
  let query = supabase
    .from('recipes')
    .select(COLUMNS)
    .eq('reusable', true)
    .order('title')
    .range(from, from + RECIPE_PAGE_SIZE - 1);

  const search = filters.search?.trim();
  if (search) query = query.ilike('title', `%${search}%`);
  if (filters.mealType) query = query.contains('meal_types', [filters.mealType]);
  if (filters.diet) query = query.contains('diet', [filters.diet]);

  const { data, error } = await query;
  if (error) throw error;
  return (data as Recipe[]) ?? [];
}
```

`COLUMNS` ya existe en el fichero (línea ~59) y `MealType` también (línea ~69).

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/lib/recipes.ts
git commit -m "feat: consulta paginada del catálogo de recetas"
```

---

### Task 2: Hook `useRecipeBook`

**Files:**
- Create: `apps/mobile/src/features/recipe-book/hooks/use-recipe-book.ts`

- [ ] **Step 1: Crear el hook**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  listCatalogRecipes,
  RECIPE_PAGE_SIZE,
  type Recipe,
  type RecipeListFilters,
} from '@/lib/recipes';

const SEARCH_DEBOUNCE_MS = 300;

// Catalog browsing state: filters, accumulated pages and infinite scroll. Changing any filter
// resets the list back to the first page.
export function useRecipeBook() {
  const [filters, setFilters] = useState<RecipeListFilters>({});
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search ?? ''), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const effectiveFilters: RecipeListFilters = {
    search: debouncedSearch,
    mealType: filters.mealType ?? null,
    diet: filters.diet ?? null,
  };
  const filtersKey = `${effectiveFilters.search}|${effectiveFilters.mealType}|${effectiveFilters.diet}`;

  // Reload from page 0 whenever the effective filters change.
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setPage(0);
    listCatalogRecipes(effectiveFilters, 0)
      .then((data) => {
        if (id !== requestId.current) return;
        setRecipes(data);
        setHasMore(data.length === RECIPE_PAGE_SIZE);
      })
      .catch(() => {
        if (id === requestId.current) setRecipes([]);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const next = page + 1;
    const id = requestId.current;
    setLoadingMore(true);
    listCatalogRecipes(effectiveFilters, next)
      .then((data) => {
        if (id !== requestId.current) return;
        setRecipes((prev) => [...prev, ...data]);
        setPage(next);
        setHasMore(data.length === RECIPE_PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => {
        if (id === requestId.current) setLoadingMore(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadingMore, hasMore, page, filtersKey]);

  return { filters, setFilters, recipes, loading, loadingMore, hasMore, loadMore };
}
```

`requestId` evita que una respuesta lenta de unos filtros antiguos pise a la actual.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/recipe-book/hooks/use-recipe-book.ts
git commit -m "feat: hook de exploración del recetario"
```

---

### Task 3: Componente de filtros

**Files:**
- Create: `apps/mobile/src/features/recipe-book/components/recipe-filters.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import type { MealType, RecipeListFilters } from '@/lib/recipes';

import { colors } from '@recetas/theme/tokens';

const MEALS: MealType[] = ['desayuno', 'almuerzo', 'merienda', 'cena'];
const DIETS: { value: 'vegetarian' | 'vegan'; label: string }[] = [
  { value: 'vegetarian', label: 'vegetariana' },
  { value: 'vegan', label: 'vegana' },
];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`border px-stack-md py-stack-sm ${
        active ? 'border-primary bg-tertiary-fixed' : 'border-outline-variant bg-background'
      }`}>
      <Text
        className={`font-mono-medium text-label-sm uppercase ${
          active ? 'text-on-tertiary-fixed' : 'text-on-surface-variant'
        }`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function RecipeFilters({
  filters,
  onChange,
}: {
  filters: RecipeListFilters;
  onChange: (filters: RecipeListFilters) => void;
}) {
  return (
    <View className="gap-stack-md">
      <View className="flex-row items-center gap-stack-md rounded-xl border border-card-border bg-card px-stack-md">
        <MaterialIcons name="search" size={20} color={colors['on-surface-variant']} />
        <TextInput
          value={filters.search ?? ''}
          onChangeText={(search) => onChange({ ...filters, search })}
          placeholder="Buscar receta"
          placeholderTextColor={colors['on-surface-variant']}
          className="flex-1 py-stack-md font-sans text-body-md text-on-surface"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-stack-sm">
        {MEALS.map((meal) => (
          <Chip
            key={meal}
            label={meal}
            active={filters.mealType === meal}
            onPress={() => onChange({ ...filters, mealType: filters.mealType === meal ? null : meal })}
          />
        ))}
        {DIETS.map((diet) => (
          <Chip
            key={diet.value}
            label={diet.label}
            active={filters.diet === diet.value}
            onPress={() =>
              onChange({ ...filters, diet: filters.diet === diet.value ? null : diet.value })
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}
```

Cada chip alterna: volver a pulsarlo lo desactiva (equivale a "Todos"), así no hace falta un chip extra.

- [ ] **Step 2: Verificar tipos**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/recipe-book/components/recipe-filters.tsx
git commit -m "feat: filtros del recetario"
```

---

### Task 4: Pantalla del tab "Recetas"

**Files:**
- Create: `apps/mobile/src/app/(tabs)/recetas.tsx`
- Modify: `apps/mobile/src/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Crear la pantalla**

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { RecipeCard, type RecipeCardData } from '@/components/recipe-card';
import { FavoriteRow } from '@/features/favorites/components/favorite-row';
import { useFavorites } from '@/features/favorites/hooks/use-favorites';
import { RecipeFilters } from '@/features/recipe-book/components/recipe-filters';
import { useRecipeBook } from '@/features/recipe-book/hooks/use-recipe-book';
import type { Recipe } from '@/lib/recipes';

import { colors } from '@recetas/theme/tokens';

// The recipe book shows the catalog, so there is no pantry cross-check here: cards carry the diet
// label when there is one instead of a missing-ingredients badge.
function toCardData(recipe: Recipe): RecipeCardData {
  return {
    id: recipe.id,
    image: recipe.image_url,
    imageStatus: recipe.image_status,
    badge: 'RECETA',
    badgeIcon: 'menu-book',
    title: recipe.title,
    description: recipe.description,
    tags: [],
  };
}

export default function RecetasScreen() {
  const [tab, setTab] = useState<'todas' | 'guardadas'>('todas');
  const { filters, setFilters, recipes, loading, loadingMore, loadMore } = useRecipeBook();
  const { entries, loading: loadingFavorites } = useFavorites();

  const openRecipe = (id: string) => router.push({ pathname: '/receta/[id]', params: { id } });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />

      <View className="flex-row gap-stack-sm px-container-padding pt-stack-lg">
        {(['todas', 'guardadas'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            className={`flex-1 border-b-2 pb-stack-md ${
              tab === value ? 'border-primary' : 'border-outline-variant'
            }`}>
            <Text
              className={`text-center font-mono-medium text-label-md uppercase ${
                tab === value ? 'text-primary' : 'text-on-surface-variant'
              }`}>
              {value === 'todas' ? 'Todas' : 'Guardadas'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'todas' ? (
        <FlatList
          data={recipes}
          keyExtractor={(recipe) => recipe.id}
          className="flex-1"
          contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-gutter"
          ListHeaderComponent={
            <View className="mb-gutter">
              <RecipeFilters filters={filters} onChange={setFilters} />
            </View>
          }
          renderItem={({ item }) => (
            <RecipeCard recipe={toCardData(item)} onPress={() => openRecipe(item.id)} />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            loading ? null : (
              <Text className="text-center font-sans text-body-md text-on-surface-variant">
                No hay recetas con esos filtros.
              </Text>
            )
          }
          ListFooterComponent={
            loading || loadingMore ? <ActivityIndicator color={colors.primary} className="py-stack-lg" /> : null
          }
        />
      ) : loadingFavorites ? (
        <ActivityIndicator color={colors.primary} className="mt-section-gap" />
      ) : entries.length === 0 ? (
        <View className="mt-section-gap items-center gap-stack-md px-container-padding">
          <MaterialIcons name="bookmark-border" size={40} color={colors['outline-variant']} />
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            Aún no tienes recetas guardadas.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(recipe) => recipe.id}
          className="flex-1"
          contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-stack-md"
          renderItem={({ item }) => <FavoriteRow recipe={item} onPress={() => openRecipe(item.id)} />}
        />
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Registrar el tab**

En `apps/mobile/src/app/(tabs)/_layout.tsx`, entre el `Tabs.Screen` de `lista` y el de `chat`:

```tsx
      <Tabs.Screen
        name="recetas"
        options={{ title: 'Recetas', tabBarIcon: tabIcon('menu-book') }}
      />
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `pnpm typecheck && pnpm --filter @recetas/mobile lint`
Expected: typecheck exit 0; lint sin errores.

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/src/app/(tabs)/recetas.tsx" "apps/mobile/src/app/(tabs)/_layout.tsx"
git commit -m "feat: tab Recetas con catálogo y guardadas"
```

---

### Task 5: Revisión y entrega

- [ ] `pnpm typecheck` y `expo lint` en verde.
- [ ] Revisión por agente del diff de la rama (flujo obligatorio del proyecto).
- [ ] PR, y merge tras confirmación del usuario.
- [ ] Requiere rebuild de APK para verse en el móvil (cambio de cliente).

## Notas

- Verificación manual pendiente en dispositivo: buscar, combinar filtros, scroll más allá de la
  primera página, guardar desde el detalle y verlo en Guardadas.
- `/favoritos` sigue existiendo (enlazada desde perfil); el tab no la elimina.
