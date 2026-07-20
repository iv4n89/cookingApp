import { useCallback, useEffect, useState } from 'react';

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
}

const COLUMNS = 'id, name, quantity, unit, checked';

export function useShoppingList() {
  const { session } = useSession();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('shopping_list_items').select(COLUMNS).order('created_at');
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add(input: NewShoppingItem) {
    if (!session) return;
    const { data } = await supabase
      .from('shopping_list_items')
      .insert({ ...input, user_id: session.user.id })
      .select(COLUMNS)
      .single();
    if (data) setItems((prev) => [...prev, data]);
  }

  async function toggle(id: string, checked: boolean) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, checked } : item)));
    await supabase.from('shopping_list_items').update({ checked }).eq('id', id);
  }

  async function removeChecked() {
    const ids = items.filter((item) => item.checked).map((item) => item.id);
    if (ids.length === 0) return;
    setItems((prev) => prev.filter((item) => !item.checked));
    await supabase.from('shopping_list_items').delete().in('id', ids);
  }

  return { items, loading, add, toggle, removeChecked };
}
