import { useCallback, useEffect, useState } from 'react';

import { getRecipe, type Recipe } from '@/lib/recipes';

import type { StepStatus } from '@/features/cooking/components/step-card';

// Cooking mode state: loads the recipe and tracks which steps are done. Derives the current
// (first not-done) step and each step's status.
export function useCooking(id: string) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());

  const reload = useCallback(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    getRecipe(id)
      .then((data) => {
        if (active) setRecipe(data);
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

  useEffect(() => {
    let active = true;
    getRecipe(id)
      .then((data) => {
        if (active) setRecipe(data);
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

  function toggleDone(index: number) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const steps = recipe?.steps ?? [];
  const current = steps.findIndex((_, i) => !done.has(i));
  const stepStatus = (i: number): StepStatus => (done.has(i) ? 'done' : i === current ? 'active' : 'upcoming');

  return { recipe, loading, failed, reload, steps, current, toggleDone, stepStatus };
}
