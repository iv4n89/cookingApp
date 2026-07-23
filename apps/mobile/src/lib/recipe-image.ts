import { useEffect, useRef, useState } from 'react';

import { supabase } from './supabase';
import type { ImageStatus } from './recipes';

const POLL_MS = 1500;
const MAX_POLLS = 13; // ~20s de sondeo como tope de seguridad

// Pide al backend generar la imagen de una receta que aún no la tiene (on-demand al abrir el
// detalle). Devuelve el estado resultante: 'pending' si se puso a generar, 'none' si no se pudo.
export async function ensureRecipeImage(recipeId: string): Promise<ImageStatus> {
  const { data } = await supabase.functions.invoke('ensure-recipe-image', { body: { recipeId } });
  return (data?.image_status as ImageStatus | undefined) ?? 'none';
}

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
