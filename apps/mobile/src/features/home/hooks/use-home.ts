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
        items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          substitutions: [],
          ingredient_id: item.ingredientId,
        })),
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
