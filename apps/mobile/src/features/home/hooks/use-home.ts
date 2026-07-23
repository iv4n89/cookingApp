import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useSession } from '@/lib/auth';
import { getPantrySummary, type PantrySummary } from '@/lib/pantry';
import { addIngredientsToShopping, recommendedRecipes, type MealType, type RecommendedRecipe } from '@/lib/recipes';
import { currentMealType, greeting } from '@/features/home/meal-time';
import { listFavorites, setFavorite } from '@/lib/user-recipes';

// Home data: recommended recipes, the pantry summary and saved (favorite) recipes. Refetches on
// focus and exposes the save toggle and the "add low-stock items to the shopping list" action.
export function useHome() {
  const { session } = useSession();
  const [suggestions, setSuggestions] = useState<RecommendedRecipe[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [meal, setMeal] = useState<MealType>(() => currentMealType(new Date()));
  // Ids ya mostrados en esta sesión, para traer nuevas en el pull-to-refresh.
  const seen = useRef<Set<string>>(new Set());
  const [pantry, setPantry] = useState<PantrySummary | null>(null);
  const [addingLow, setAddingLow] = useState(false);
  const [addedLow, setAddedLow] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  // In-flight save toggles, to ignore repeated taps while a request resolves.
  const savingIds = useRef<Set<string>>(new Set());

  const fetchSuggestions = useCallback((mealType: MealType, exclude: string[]) => {
    return recommendedRecipes(mealType, exclude).then((data) => {
      data.forEach((recipe) => seen.current.add(recipe.id));
      return data;
    });
  }, []);

  const load = useCallback(() => {
    let active = true;
    const mealType = currentMealType(new Date());
    setMeal(mealType);
    seen.current.clear();
    setLoadingSuggestions(true);
    setAddedLow(false);
    fetchSuggestions(mealType, [])
      .then((data) => {
        if (active) setSuggestions(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingSuggestions(false);
      });
    getPantrySummary()
      .then((data) => {
        if (active) setPantry(data);
      })
      .catch(() => {});
    listFavorites()
      .then((favorites) => {
        if (active) setSaved(new Set(favorites.map((favorite) => favorite.id)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [fetchSuggestions]);

  useFocusEffect(load);

  // Pull-to-refresh: trae otras recetas excluyendo las ya vistas; si se agotan, reinicia.
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    const mealType = currentMealType(new Date());
    setMeal(mealType);
    try {
      let data = await fetchSuggestions(mealType, Array.from(seen.current));
      if (data.length === 0) {
        seen.current.clear();
        data = await fetchSuggestions(mealType, []);
      }
      if (data.length > 0) setSuggestions(data);
    } catch {
      // se ignora; el usuario puede reintentar
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

  async function addLowToShopping() {
    if (!session || !pantry || addingLow || addedLow || pantry.low.length === 0) return;
    setAddingLow(true);
    try {
      await addIngredientsToShopping(
        pantry.low.map((item) => ({ name: item.name, quantity: null, unit: item.unit, substitutions: [] })),
      );
      setAddedLow(true);
    } catch {
      // ignored; the user can retry
    } finally {
      setAddingLow(false);
    }
  }

  return {
    // Sección principal (cocinables/a falta de 1, o ideas si la despensa no da nada).
    suggestions: suggestions.filter((recipe) => recipe.bucket !== 'buy'),
    // Sección "para comprar algo más" (faltan 2-4).
    buySuggestions: suggestions.filter((recipe) => recipe.bucket === 'buy'),
    loadingSuggestions,
    refreshing,
    refresh,
    meal,
    greetingText: greeting(new Date()),
    pantry,
    addingLow,
    addedLow,
    saved,
    toggleSave,
    addLowToShopping,
  };
}
