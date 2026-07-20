import { useCallback, useEffect, useState } from 'react';

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
}

const COLUMNS = 'id, name, quantity, unit, category';

export function usePantry() {
  const { session } = useSession();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('pantry_items').select(COLUMNS).order('name');
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add(input: NewPantryItem) {
    if (!session) return;
    const { data } = await supabase
      .from('pantry_items')
      .insert({ ...input, user_id: session.user.id })
      .select(COLUMNS)
      .single();
    if (data) setItems((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function setQuantity(id: string, quantity: number) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity } : item)));
    await supabase.from('pantry_items').update({ quantity }).eq('id', id);
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    await supabase.from('pantry_items').delete().eq('id', id);
  }

  return { items, loading, add, setQuantity, remove };
}
