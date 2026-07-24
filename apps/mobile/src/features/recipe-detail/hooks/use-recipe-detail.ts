import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { useSession } from '@/lib/auth';
import { cookRecipe } from '@/lib/cooking';
import { getCanonicalMap, type CanonicalMap } from '@/lib/ingredients';
import { getPantryForCook, type CookPantryItem } from '@/lib/pantry';
import { getRecipe, scaleIngredients, type Recipe } from '@/lib/recipes';
import { getUserRecipe, setFavorite, setRating, type UserRecipeMeta } from '@/lib/user-recipes';

// Recetas ya cocinadas (descontadas) en esta sesión de app: reentrar no vuelve a descontar.
const cookedThisSession = new Set<string>();

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
  const [canonMap, setCanonMap] = useState<CanonicalMap>(new Map());
  const [cooking, setCooking] = useState(false);
  const [cookFailed, setCookFailed] = useState(false);
  const recipeId = recipe?.id;
  const cooked = recipeId ? cookedThisSession.has(recipeId) : false;

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

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setFailed(false);
      try {
        const data = await getRecipe(id);
        if (!active) return;
        setRecipe(data);
        if (data) {
          const requested = Number(servingsParam);
          setServings(requested > 0 ? requested : data.servings > 0 ? data.servings : 1);
        }
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id, servingsParam]);

  useEffect(() => {
    if (!recipeId) return;
    let active = true;
    getUserRecipe(recipeId)
      .then((data) => {
        if (active) setMeta(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [recipeId]);

  useEffect(() => {
    let active = true;
    getPantryForCook()
      .then((data) => {
        if (active) setPantry(data);
      })
      .catch(() => {});
    getCanonicalMap()
      .then((data) => {
        if (active) setCanonMap(data);
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

  async function doCook() {
    if (!recipe) return;
    setCooking(true);
    setCookFailed(false);
    try {
      await cookRecipe(recipe.id, servings);
      cookedThisSession.add(recipe.id);
      router.push({ pathname: '/cocinar/[id]', params: { id: recipe.id } });
    } catch {
      setCookFailed(true);
    } finally {
      setCooking(false);
    }
  }

  // Descuenta la despensa (con confirmación) y entra al modo cocina. Si ya se cocinó en esta
  // sesión, entra sin volver a descontar (evita el doble descuento al reentrar).
  function startCooking() {
    if (!recipe || cooking) return;
    if (cookedThisSession.has(recipe.id)) {
      router.push({ pathname: '/cocinar/[id]', params: { id: recipe.id } });
      return;
    }
    // Bloquea ya (antes de abrir el diálogo) para que un doble-tap no apile dos Alert.
    setCooking(true);
    Alert.alert(
      '¿Cocinar esta receta?',
      'Se descontarán sus ingredientes de tu despensa.',
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => setCooking(false) },
        { text: 'Cocinar', onPress: doCook },
      ],
      { cancelable: true, onDismiss: () => setCooking(false) },
    );
  }

  // Swaps in the AI-modified recipe (a new row in `recipes`) and re-bases servings on it.
  // Everything keyed by recipe id (user meta, hero image, cooking) follows the new recipe.
  function applyRecipe(next: Recipe) {
    setRecipe(next);
    setServings(next.servings > 0 ? next.servings : 1);
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
    canonMap,
    cooking,
    cooked,
    cookFailed,
    startCooking,
    applyRecipe,
  };
}
