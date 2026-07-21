import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useSession } from '@/lib/auth';
import { cookRecipe } from '@/lib/cooking';
import { getPantryForCook, type CookPantryItem } from '@/lib/pantry';
import { computeCookDeltas } from '@/lib/pantry-match';
import { getRecipe, scaleIngredients, type Recipe } from '@/lib/recipes';
import { getUserRecipe, setFavorite, setRating, type UserRecipeMeta } from '@/lib/user-recipes';

// Loads a recipe and its per-user metadata (favorite/rating), tracks the chosen servings and
// exposes the favorite/rate/cook actions. Keeps the recipe detail screen free of data logic.
export function useRecipeDetail(id: string, servingsParam?: string) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [servings, setServings] = useState(1);
  const { session } = useSession();
  const [meta, setMeta] = useState<UserRecipeMeta>({ is_favorite: false, rating: null });
  const [pantry, setPantry] = useState<CookPantryItem[] | null>(null);
  const [cooking, setCooking] = useState(false);

  const reload = useCallback(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    getRecipe(id)
      .then((data) => {
        if (active) {
          setRecipe(data);
          if (data) {
            const requested = Number(servingsParam);
            setServings(requested > 0 ? requested : data.servings > 0 ? data.servings : 1);
          }
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
  }, [id, servingsParam]);

  useEffect(() => reload(), [reload]);

  useEffect(() => {
    if (!recipe) return;
    let active = true;
    getUserRecipe(recipe.id)
      .then((data) => {
        if (active) setMeta(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [recipe?.id]);

  useEffect(() => {
    let active = true;
    getPantryForCook()
      .then((data) => {
        if (active) setPantry(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function toggleFavorite() {
    if (!recipe || !session) return;
    const next = !meta.is_favorite;
    setMeta((prev) => ({ ...prev, is_favorite: next }));
    try {
      await setFavorite(session.user.id, recipe.id, next);
    } catch {
      setMeta((prev) => ({ ...prev, is_favorite: !next }));
    }
  }

  async function rate(value: number) {
    if (!recipe || !session) return;
    const prev = meta.rating;
    setMeta((current) => ({ ...current, rating: value }));
    try {
      await setRating(session.user.id, recipe.id, value);
    } catch {
      setMeta((current) => ({ ...current, rating: prev }));
    }
  }

  async function startCooking() {
    if (!recipe || cooking) return;
    setCooking(true);
    // Best-effort discount: if it fails we still let the user cook.
    try {
      const items = await getPantryForCook();
      const scaled = scaleIngredients(recipe.ingredients, recipe.servings, servings);
      await cookRecipe(recipe.id, servings, computeCookDeltas(scaled, items));
    } catch {
      // ignored; the user can adjust the pantry by hand
    }
    setCooking(false);
    router.push({ pathname: '/cocinar/[id]', params: { id: recipe.id } });
  }

  const scaledIngredients = recipe ? scaleIngredients(recipe.ingredients, recipe.servings, servings) : [];

  return {
    recipe,
    loading,
    failed,
    reload,
    servings,
    setServings,
    scaledIngredients,
    meta,
    toggleFavorite,
    rate,
    pantry,
    cooking,
    startCooking,
  };
}
