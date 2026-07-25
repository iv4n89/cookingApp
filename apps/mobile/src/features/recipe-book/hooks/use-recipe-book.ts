import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  listCatalogRecipes,
  RECIPE_PAGE_SIZE,
  type Recipe,
  type RecipeListFilters,
} from '@/lib/recipes';

const SEARCH_DEBOUNCE_MS = 300;

// Pages already loaded for one specific set of filters. Keeping the filters they belong to lets us
// derive "loading" (the page we hold is not the one being asked for) instead of toggling a flag.
interface LoadedPages {
  key: string;
  recipes: Recipe[];
  page: number;
  hasMore: boolean;
}

function filtersKey(filters: RecipeListFilters): string {
  return `${filters.search ?? ''}|${filters.mealType ?? ''}|${filters.diet ?? ''}`;
}

// Catalog browsing state: filters, accumulated pages and infinite scroll. Changing any filter
// reloads from the first page.
export function useRecipeBook() {
  const [filters, setFilters] = useState<RecipeListFilters>({});
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loaded, setLoaded] = useState<LoadedPages | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Guards against a slow response for stale filters overwriting the current list.
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search ?? ''), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const effectiveFilters = useMemo<RecipeListFilters>(
    () => ({
      search: debouncedSearch,
      mealType: filters.mealType ?? null,
      diet: filters.diet ?? null,
    }),
    [debouncedSearch, filters.mealType, filters.diet],
  );
  const key = filtersKey(effectiveFilters);

  useEffect(() => {
    const id = ++requestId.current;
    listCatalogRecipes(effectiveFilters, 0)
      .then((data) => {
        if (id !== requestId.current) return;
        setLoaded({ key, recipes: data, page: 0, hasMore: data.length === RECIPE_PAGE_SIZE });
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setLoaded({ key, recipes: [], page: 0, hasMore: false });
      });
  }, [effectiveFilters, key]);

  // While the loaded pages belong to older filters, the list is still loading.
  const current = loaded?.key === key ? loaded : null;
  const loading = current === null;

  const loadMore = useCallback(() => {
    if (!current || loadingMore || !current.hasMore) return;
    const next = current.page + 1;
    const id = requestId.current;
    setLoadingMore(true);
    listCatalogRecipes(effectiveFilters, next)
      .then((data) => {
        if (id !== requestId.current) return;
        setLoaded((prev) =>
          prev?.key === key
            ? {
                ...prev,
                recipes: [...prev.recipes, ...data],
                page: next,
                hasMore: data.length === RECIPE_PAGE_SIZE,
              }
            : prev,
        );
      })
      .catch(() => {})
      .finally(() => {
        if (id === requestId.current) setLoadingMore(false);
      });
  }, [current, loadingMore, effectiveFilters, key]);

  return {
    filters,
    setFilters,
    recipes: current?.recipes ?? [],
    loading,
    loadingMore,
    hasMore: current?.hasMore ?? false,
    loadMore,
  };
}
