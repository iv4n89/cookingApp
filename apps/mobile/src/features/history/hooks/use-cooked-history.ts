import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { listCooked, uncookRecipe, type CookedEntry } from '@/lib/cooking';

// Cooked-recipe history list: loads entries on focus and deletes (uncook) an entry, which
// restores its ingredients to the pantry and drops it from the list.
export function useCookedHistory() {
  const [entries, setEntries] = useState<CookedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const load = useCallback(() => {
    let active = true;
    listCooked()
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

  async function remove(id: string) {
    if (busy) return;
    setBusy(id);
    setDeleteFailed(false);
    try {
      await uncookRecipe(id);
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
    } catch {
      setDeleteFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return { entries, loading, busy, deleteFailed, remove };
}
