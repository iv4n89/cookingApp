import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useSession } from '@/lib/auth';
import { getPantrySummary, type PantrySummary } from '@/lib/pantry';
import { addIngredientsToShopping, recommendedRecipes, type RecommendedRecipe } from '@/lib/recipes';
import { listFavorites, setFavorite } from '@/lib/user-recipes';

// Home data: recommended recipes, the pantry summary and saved (favorite) recipes. Refetches on
// focus and exposes the save toggle and the "add low-stock items to the shopping list" action.
export function useHome() {
  const { session } = useSession();
  const [suggestions, setSuggestions] = useState<RecommendedRecipe[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [pantry, setPantry] = useState<PantrySummary | null>(null);
  const [addingLow, setAddingLow] = useState(false);
  const [addedLow, setAddedLow] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  // In-flight save toggles, to ignore repeated taps while a request resolves.
  const savingIds = useRef<Set<string>>(new Set());

  const load = useCallback(() => {
    let active = true;
    setLoadingSuggestions(true);
    setAddedLow(false);
    recommendedRecipes()
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
  }, []);

  useFocusEffect(load);

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
        session.user.id,
        pantry.low.map((item) => ({ name: item.name, quantity: null, unit: item.unit, substitutions: [] })),
      );
      setAddedLow(true);
    } catch {
      // ignored; the user can retry
    } finally {
      setAddingLow(false);
    }
  }

  return { suggestions, loadingSuggestions, pantry, addingLow, addedLow, saved, toggleSave, addLowToShopping };
}
