import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { listFavorites, type FavoriteRecipe } from '@/lib/user-recipes';

// Loads the user's favorite (saved) recipes. It reloads on focus and not only on mount: the recipe
// book tab stays mounted, so what you save from the discoverer would not show up on the way back.
export function useFavorites() {
  const [entries, setEntries] = useState<FavoriteRecipe[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let active = true;
    listFavorites()
      .then((data) => {
        if (active) setEntries(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  return { entries, loading };
}
