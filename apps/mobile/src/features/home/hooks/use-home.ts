import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import type { TodayDecision, TodayRecipeCard } from '@recetas/shared';
import { useSession } from '@/lib/auth';
import { ensureRecipeImage } from '@/lib/recipe-image';
import { todayDecision } from '@/lib/recipes';
import { currentMealType, greeting } from '@/features/home/meal-time';
import { listFavorites, setFavorite } from '@/lib/user-recipes';

// Home data: the composed "today decision" (priority products, featured recipe, alternatives).
// Refetches on focus; exposes the save toggle.
export function useHome() {
  const { session } = useSession();
  const [decision, setDecision] = useState<TodayDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [meal, setMeal] = useState(() => currentMealType(new Date()));
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const savingIds = useRef<Set<string>>(new Set());
  const imageRequested = useRef<Set<string>>(new Set());

  // Kicks off lazy image generation for recipes shown without one and marks them 'pending' so
  // their card polls the DB (via useRecipeImage) until the image is ready.
  const queueImages = useCallback((data: TodayDecision): TodayDecision => {
    const mark = (card: TodayRecipeCard | null): TodayRecipeCard | null => {
      if (!card || card.imageUrl || card.imageStatus === 'pending') return card;
      if (!imageRequested.current.has(card.recipeId)) {
        imageRequested.current.add(card.recipeId);
        ensureRecipeImage(card.recipeId).catch(() => {});
      }
      return { ...card, imageStatus: 'pending' };
    };
    return {
      ...data,
      pantry: {
        featured: mark(data.pantry.featured),
        alternatives: data.pantry.alternatives.map((card) => mark(card) as TodayRecipeCard),
      },
      discover: data.discover.map((card) => mark(card) as TodayRecipeCard),
    };
  }, []);

  const fetchDecision = useCallback(
    (mealType: ReturnType<typeof currentMealType>) => {
      return todayDecision(mealType).then((data) => (data ? queueImages(data) : data));
    },
    [queueImages],
  );

  const load = useCallback(() => {
    let active = true;
    const mealType = currentMealType(new Date());
    setMeal(mealType);
    setLoading(true);
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

  return {
    decision,
    loading,
    refreshing,
    refresh,
    meal,
    greetingText: greeting(new Date()),
    saved,
    toggleSave,
  };
}
