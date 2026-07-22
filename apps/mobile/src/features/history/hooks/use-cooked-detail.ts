import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { getCooked, uncookRecipe, type CookedEntry } from '@/lib/cooking';
import { getRecipe, type Recipe } from '@/lib/recipes';

// Loads a cooked-recipe history entry along with its recipe, and exposes the delete (uncook)
// action, which restores the pantry and goes back.
export function useCookedDetail(id: string) {
  const [entry, setEntry] = useState<CookedEntry | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const reload = useCallback(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    getCooked(id)
      .then(async (cooked) => {
        if (!cooked) {
          if (active) setFailed(true);
          return;
        }
        const recipeData = await getRecipe(cooked.recipe_id);
        if (active) {
          setEntry(cooked);
          setRecipe(recipeData);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => reload(), [reload]);

  async function remove() {
    if (deleting || !entry) return;
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await uncookRecipe(entry.id);
      router.back();
    } catch {
      setDeleteFailed(true);
      setDeleting(false);
    }
  }

  return { entry, recipe, loading, failed, deleting, deleteFailed, remove };
}
