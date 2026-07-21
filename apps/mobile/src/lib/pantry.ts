import { useCallback, useEffect, useRef, useState } from 'react';

import { useSession } from './auth';
import { normalize } from './ingredients';
import { supabase } from './supabase';

// Lo que hay en la despensa, para saber qué ingredientes de una receta faltan.
export interface PantryMatch {
  ids: Set<string>;
  names: Set<string>;
}

export async function getPantryMatch(): Promise<PantryMatch> {
  const { data, error } = await supabase.from('pantry_items').select('ingredient_id, name');
  if (error) throw error;
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const row of data ?? []) {
    if (row.ingredient_id) ids.add(row.ingredient_id as string);
    if (row.name) names.add(normalize(row.name as string));
  }
  return { ids, names };
}

export interface PantryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
}

// Lo que necesita el descuento al cocinar: item con su cantidad y enlace al catálogo.
export interface CookPantryItem {
  id: string;
  name: string;
  quantity: number | null;
  ingredient_id: string | null;
}

export interface PantrySummary {
  count: number;
  // Los ingredientes con menos stock (por cantidad), para el resumen de la Home.
  low: { id: string; name: string; quantity: number; unit: string | null }[];
}

export async function getPantrySummary(): Promise<PantrySummary> {
  const { data, error } = await supabase.from('pantry_items').select('id, name, quantity, unit');
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    quantity: row.quantity == null ? null : Number(row.quantity),
    unit: (row.unit as string | null) ?? null,
  }));
  const low = rows
    .filter((row): row is PantrySummary['low'][number] => row.quantity != null)
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 3);
  return { count: rows.length, low };
}

export async function getPantryForCook(): Promise<CookPantryItem[]> {
  const { data, error } = await supabase.from('pantry_items').select('id, name, quantity, ingredient_id');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    quantity: row.quantity == null ? null : Number(row.quantity),
    ingredient_id: (row.ingredient_id as string | null) ?? null,
  }));
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
