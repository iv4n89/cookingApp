import { useMemo, useState } from 'react';

import { isLowStock } from '@/features/pantry/pantry-item';
import { usePantry, type PantryItem } from '@/lib/pantry';

const UNCATEGORIZED = 'Otros';

function groupByCategory(items: PantryItem[]) {
  const groups = new Map<string, PantryItem[]>();
  for (const item of items) {
    const key = item.category?.trim() || UNCATEGORIZED;
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// Screen state for the pantry: wraps the pantry data hook and adds the filter, the search query,
// the add/min-stock modals and the derived, grouped list of visible items.
export function usePantryScreen() {
  const { items, loading, error, refresh, add, setQuantity, setMinStock, remove } = usePantry();
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [query, setQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMin, setEditingMin] = useState<PantryItem | null>(null);
  const [minDraft, setMinDraft] = useState('');
  const [editingQty, setEditingQty] = useState<PantryItem | null>(null);
  const [qtyDraft, setQtyDraft] = useState('');

  function openMinEditor(item: PantryItem) {
    setEditingMin(item);
    setMinDraft(item.min_stock != null ? String(item.min_stock) : '');
  }

  function closeMinEditor() {
    setEditingMin(null);
  }

  function saveMin() {
    if (!editingMin) return;
    const parsed = minDraft.trim() ? Number(minDraft.replace(',', '.')) : null;
    setMinStock(editingMin.id, parsed !== null && !Number.isNaN(parsed) ? parsed : null);
    setEditingMin(null);
  }

  function openQtyEditor(item: PantryItem) {
    setEditingQty(item);
    setQtyDraft(item.quantity != null ? String(item.quantity) : '');
  }

  function closeQtyEditor() {
    setEditingQty(null);
  }

  function saveQty() {
    if (!editingQty) return;
    const parsed = qtyDraft.trim() ? Number(qtyDraft.replace(',', '.')) : 0;
    if (!Number.isNaN(parsed) && parsed >= 0) setQuantity(editingQty.id, parsed);
    setEditingQty(null);
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === 'low' && !isLowStock(item)) return false;
      if (needle && !item.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [items, filter, query]);

  const groups = useMemo(() => groupByCategory(visible), [visible]);

  return {
    items,
    loading,
    error,
    refresh,
    add,
    setQuantity,
    remove,
    filter,
    setFilter,
    query,
    setQuery,
    visible,
    groups,
    modalVisible,
    setModalVisible,
    editingMin,
    minDraft,
    setMinDraft,
    openMinEditor,
    saveMin,
    closeMinEditor,
    editingQty,
    qtyDraft,
    setQtyDraft,
    openQtyEditor,
    saveQty,
    closeQtyEditor,
  };
}
