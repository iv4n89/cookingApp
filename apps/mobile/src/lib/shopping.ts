import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useSession } from './auth';
import { createIdempotencyKey } from './idempotency';
import { supabase } from './supabase';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  ingredient_id: string | null;
}

export interface NewShoppingItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  ingredient_id: string | null;
}

const COLUMNS = 'id, name, quantity, unit, checked, ingredient_id';

// Fetch puntual (fuera del hook) para calcular qué falta de una receta ya está en la lista.
export async function getShoppingItems(): Promise<ShoppingItem[]> {
  const { data, error } = await supabase.from('shopping_list_items').select(COLUMNS).order('created_at');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as ShoppingItem),
    quantity: row.quantity == null ? null : Number(row.quantity),
  }));
}

export function useShoppingList() {
  const { session } = useSession();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .select(COLUMNS)
      .order('created_at');
    if (error) setError('No se pudo cargar la lista.');
    else {
      setError(null);
      setItems(data ?? []);
    }
    setLoading(false);
  }, []);

  // Recarga al enfocar la pestaña: refleja lo añadido desde el detalle de receta.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function add(input: NewShoppingItem) {
    if (!session) return;
    const { data, error } = await supabase.rpc('add_shopping_item', {
      p_name: input.name,
      p_quantity: input.quantity,
      p_unit: input.unit,
      p_ingredient_id: input.ingredient_id,
      p_recipe_id: null,
      p_idempotency_key: createIdempotencyKey(),
    });
    if (error) {
      setError('No se pudo añadir el item.');
      return;
    }
    if (data) await refresh();
  }

  async function toggle(id: string, checked: boolean) {
    const snapshot = items;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, checked } : item)));
    const { error } = await supabase.rpc('set_shopping_checked', { p_item_id: id, p_checked: checked });
    if (error) {
      setError('No se pudo actualizar el item.');
      setItems(snapshot);
    }
  }

  async function editItem(id: string, quantity: number | null, unit: string | null) {
    const snapshot = items;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity, unit } : item)));
    const { error } = await supabase.rpc('update_shopping_item', {
      p_item_id: id,
      p_quantity: quantity,
      p_unit: unit,
    });
    if (error) {
      setError('No se pudo guardar el cambio.');
      setItems(snapshot);
    }
  }

  // Marca lo comprado: lo mueve a la despensa (fusionando cantidades) y lo quita de la lista.
  async function buyChecked() {
    const ids = items.filter((item) => item.checked).map((item) => item.id);
    if (ids.length === 0) return;
    const snapshot = items;
    setItems((prev) => prev.filter((item) => !item.checked));
    const { error } = await supabase.rpc('complete_shopping_items', {
      p_ids: ids,
      p_idempotency_key: createIdempotencyKey(),
    });
    if (error) {
      setError('No se pudo mover a la despensa.');
      setItems(snapshot);
    }
  }

  return { items, loading, error, refresh, add, toggle, editItem, buyChecked };
}
