import { useEffect, useRef, useState } from 'react';

import { supabase } from './supabase';
import type { ImageStatus } from './recipes';

const POLL_MS = 1500;
const MAX_POLLS = 13; // ~20s de sondeo como tope de seguridad

// Resuelve la imagen de una receta: si está lista, su url; si se está generando ('pending'),
// sondea hasta que llegue ('ready') o se descarte ('none'); si no habrá, null. `pending`
// indica mostrar spinner.
export function useRecipeImage(
  recipeId: string,
  initialUrl: string | null,
  initialStatus: ImageStatus | null | undefined,
): { image: string | null; pending: boolean } {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [status, setStatus] = useState<ImageStatus>(initialUrl ? 'ready' : initialStatus ?? 'none');

  useEffect(() => {
    setUrl(initialUrl);
    setStatus(initialUrl ? 'ready' : initialStatus ?? 'none');
  }, [recipeId, initialUrl, initialStatus]);

  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    if (url || status !== 'pending') return;
    let polls = 0;
    const timer = setInterval(async () => {
      polls += 1;
      const { data } = await supabase
        .from('recipes')
        .select('image_url, image_status')
        .eq('id', recipeId)
        .maybeSingle();
      if (!active.current) return;
      const nextUrl = (data?.image_url as string | null) ?? null;
      const nextStatus = (data?.image_status as ImageStatus | null) ?? 'none';
      if (nextUrl) {
        setUrl(nextUrl);
        setStatus('ready');
        clearInterval(timer);
      } else if (nextStatus !== 'pending' || polls >= MAX_POLLS) {
        setStatus('none');
        clearInterval(timer);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [recipeId, url, status]);

  return { image: url, pending: !url && status === 'pending' };
}
