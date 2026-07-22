import { useCallback, useEffect, useState } from 'react';

import { listFavorites, type FavoriteRecipe } from '@/lib/user-recipes';

// Loads the user's favorite (saved) recipes.
export function useFavorites() {
  const [entries, setEntries] = useState<FavoriteRecipe[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
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

  useEffect(() => load(), [load]);

  return { entries, loading };
}
