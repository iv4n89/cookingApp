import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useSession } from './auth';
import { supabase } from './supabase';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
}

export interface NewShoppingItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  ingredient_id: string | null;
}

const COLUMNS = 'id, name, quantity, unit, checked';

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
    const { data, error } = await supabase
      .from('shopping_list_items')
      .insert({ ...input, user_id: session.user.id })
      .select(COLUMNS)
      .single();
    if (error) {
      setError('No se pudo añadir el item.');
      return;
    }
    if (data) setItems((prev) => [...prev, data]);
  }

  async function toggle(id: string, checked: boolean) {
    const snapshot = items;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, checked } : item)));
    const { error } = await supabase.from('shopping_list_items').update({ checked }).eq('id', id);
    if (error) {
      setError('No se pudo actualizar el item.');
      setItems(snapshot);
    }
  }

  async function editItem(id: string, quantity: number | null, unit: string | null) {
    const snapshot = items;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity, unit } : item)));
    const { error } = await supabase.from('shopping_list_items').update({ quantity, unit }).eq('id', id);
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
    const { error } = await supabase.rpc('buy_shopping_items', { p_ids: ids });
    if (error) {
      setError('No se pudo mover a la despensa.');
      setItems(snapshot);
    }
  }

  return { items, loading, error, refresh, add, toggle, editItem, buyChecked };
}
