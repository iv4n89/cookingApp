import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useSession } from './auth';
import { supabase } from './supabase';

// Lo que hay en la despensa, para saber qué ingredientes de una receta faltan (item-based:
// mantiene la asociación id<->nombre para casar por par).
export type PantryMatch = { ingredient_id: string | null; name: string }[];

export async function getPantryMatch(): Promise<PantryMatch> {
  const { data, error } = await supabase.from('pantry_items').select('ingredient_id, name');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ingredient_id: (row.ingredient_id as string | null) ?? null,
    name: (row.name as string) ?? '',
  }));
}

export interface PantryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  min_stock: number | null;
}

// Lo que necesita el descuento al cocinar: item con su cantidad y enlace al catálogo.
export interface CookPantryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  ingredient_id: string | null;
}

export interface PantrySummary {
  count: number;
  // Ingredientes por debajo de su mínimo (stock bajo), para el resumen de la Home.
  low: { id: string; name: string; quantity: number; unit: string | null }[];
}

export async function getPantrySummary(): Promise<PantrySummary> {
  const { data, error } = await supabase.from('pantry_items').select('id, name, quantity, unit, min_stock');
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    quantity: row.quantity == null ? null : Number(row.quantity),
    unit: (row.unit as string | null) ?? null,
    min_stock: row.min_stock == null ? null : Number(row.min_stock),
  }));
  const low = rows
    .filter((row) => row.quantity != null && row.min_stock != null && row.quantity <= row.min_stock)
    .sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0))
    .map((row) => ({ id: row.id, name: row.name, quantity: row.quantity as number, unit: row.unit }));
  return { count: rows.length, low };
}

export async function getPantryForCook(): Promise<CookPantryItem[]> {
  const { data, error } = await supabase.from('pantry_items').select('id, name, quantity, unit, ingredient_id');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    quantity: row.quantity == null ? null : Number(row.quantity),
    unit: (row.unit as string | null) ?? null,
    ingredient_id: (row.ingredient_id as string | null) ?? null,
  }));
}

export interface NewPantryItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  ingredient_id: string | null;
  min_stock: number | null;
}

const COLUMNS = 'id, name, quantity, unit, category, min_stock';

// Postgres numeric llega como string; lo normalizamos a número para mostrarlo limpio.
function toItem(row: PantryItem): PantryItem {
  return {
    ...row,
    quantity: row.quantity == null ? null : Number(row.quantity),
    min_stock: row.min_stock == null ? null : Number(row.min_stock),
  };
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
    // Espera las escrituras en vuelo (cola del stepper) antes de leer, para no traer un estado
    // previo y pisar el valor optimista al volver a la pestaña.
    const pending = Object.values(writes.current);
    if (pending.length) await Promise.allSettled(pending);
    const { data, error } = await supabase.from('pantry_items').select(COLUMNS).order('name');
    if (error) setError('No se pudieron cargar los ingredientes.');
    else {
      setError(null);
      setItems((data ?? []).map(toItem));
    }
    setLoading(false);
  }, []);

  // Recarga al enfocar la pestaña (no solo al montar): así se ve lo comprado que se
  // acaba de mover a la despensa desde la lista de la compra.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

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

  function setMinStock(id: string, min: number | null) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, min_stock: min } : item)));
    const previous = writes.current[id] ?? Promise.resolve();
    writes.current[id] = previous.then(async () => {
      const { error } = await supabase.from('pantry_items').update({ min_stock: min }).eq('id', id);
      if (error) {
        setError('No se pudo guardar el mínimo.');
        refresh();
      }
    });
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    const { error } = await supabase.from('pantry_items').delete().eq('id', id);
    if (error) {
      setError('No se pudo eliminar el ingrediente.');
      // Re-sincroniza desde la DB en vez de restaurar un snapshot que pudo quedar obsoleto
      // (una escritura de cantidad concurrente lo habría revertido).
      refresh();
    }
  }

  return { items, loading, error, refresh, add, setQuantity, setMinStock, remove };
}
