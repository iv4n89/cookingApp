import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSession } from '@/lib/auth';
import { getPreferences, savePreferences } from '@/lib/preferences';

// Food preferences and special needs state: loads the user's saved selections, tracks the
// search query and free-text notes, and persists everything. `saved` reflects a clean, just-saved
// state and resets on any edit.
export function usePreferences() {
  const { session } = useSession();
  const [food, setFood] = useState<Set<string>>(new Set());
  const [needs, setNeeds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const reload = useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    getPreferences()
      .then((prefs) => {
        if (!active) return;
        setFood(new Set(prefs.food_prefs));
        setNeeds(new Set(prefs.special_needs));
        setNotes(prefs.notes);
      })
      .catch(() => {
        // Si no se pudo cargar, la pantalla no muestra el formulario, para no sobrescribir
        // las preferencias reales con un estado vacío al guardar.
        if (active) setLoadFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => reload(), [reload]);

  const toggle = useCallback((setter: typeof setFood) => {
    return (label: string) => {
      setSaved(false);
      setSaveFailed(false);
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(label)) next.delete(label);
        else next.add(label);
        return next;
      });
    };
  }, []);

  const toggleFood = useMemo(() => toggle(setFood), [toggle]);
  const toggleNeeds = useMemo(() => toggle(setNeeds), [toggle]);

  function changeNotes(text: string) {
    setSaved(false);
    setSaveFailed(false);
    setNotes(text);
  }

  async function save() {
    if (!session || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await savePreferences(session.user.id, {
        food_prefs: [...food],
        special_needs: [...needs],
        notes: notes.trim(),
      });
      setSaved(true);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return {
    loading,
    loadFailed,
    reload,
    saving,
    saved,
    saveFailed,
    query,
    setQuery,
    food,
    needs,
    notes,
    changeNotes,
    toggleFood,
    toggleNeeds,
    save,
  };
}
