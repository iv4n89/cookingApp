import { useCallback, useEffect, useRef, useState } from 'react';

import { useSession } from './auth';
import { supabase } from './supabase';

export interface PantryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
}

export interface NewPantryItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  ingredient_id: string | null;
}

const COLUMNS = 'id, name, quantity, unit, category';

// Postgres numeric llega como string; lo normalizamos a número para mostrarlo limpio.
function toItem(row: PantryItem): PantryItem {
  return { ...row, quantity: row.quantity == null ? null : Number(row.quantity) };
}

export function usePantry() {
  const { session } = useSession();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Cola de escritura por item: serializa los updates para que el último
  // valor pulsado sea el que quede en la DB (evita carreras del stepper).
  const writes = useRef<Record<string, Promise<unknown>>>({});

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('pantry_items').select(COLUMNS).order('name');
    if (error) setError('No se pudieron cargar los ingredientes.');
    else {
      setError(null);
      setItems((data ?? []).map(toItem));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add(input: NewPantryItem) {
    if (!session) return;
    const { data, error } = await supabase
      .from('pantry_items')
      .insert({ ...input, user_id: session.user.id })
      .select(COLUMNS)
      .single();
    if (error) {
      setError('No se pudo añadir el ingrediente.');
      return;
    }
    if (data) setItems((prev) => [...prev, toItem(data)].sort((a, b) => a.name.localeCompare(b.name)));
  }

  function setQuantity(id: string, quantity: number) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity } : item)));
    const previous = writes.current[id] ?? Promise.resolve();
    writes.current[id] = previous.then(async () => {
      const { error } = await supabase.from('pantry_items').update({ quantity }).eq('id', id);
      if (error) {
        setError('No se pudo guardar la cantidad.');
        refresh();
      }
    });
  }

  async function remove(id: string) {
    const snapshot = items;
    setItems((prev) => prev.filter((item) => item.id !== id));
    const { error } = await supabase.from('pantry_items').delete().eq('id', id);
    if (error) {
      setError('No se pudo eliminar el ingrediente.');
      setItems(snapshot);
    }
  }

  return { items, loading, error, refresh, add, setQuantity, remove };
}
