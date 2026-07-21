import { useState } from 'react';

import { useShoppingList, type ShoppingItem } from '@/lib/shopping';

// Shopping list screen state: wraps the shopping data hook and adds the add-item modal, the
// quantity/unit editor and the count of checked items.
export function useShoppingScreen() {
  const { items, loading, error, refresh, add, toggle, editItem, buyChecked } = useShoppingList();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingQty, setEditingQty] = useState<ShoppingItem | null>(null);
  const [qtyDraft, setQtyDraft] = useState('');
  const [unitDraft, setUnitDraft] = useState<string | null>(null);

  function openQtyEditor(item: ShoppingItem) {
    setEditingQty(item);
    setQtyDraft(item.quantity != null ? String(item.quantity) : '');
    setUnitDraft(item.unit);
  }

  function closeQtyEditor() {
    setEditingQty(null);
  }

  function saveQty() {
    if (!editingQty) return;
    const parsed = qtyDraft.trim() ? Number(qtyDraft.replace(',', '.')) : null;
    editItem(editingQty.id, parsed !== null && !Number.isNaN(parsed) ? parsed : null, unitDraft);
    setEditingQty(null);
  }

  const checkedCount = items.filter((item) => item.checked).length;

  return {
    items,
    loading,
    error,
    refresh,
    add,
    toggle,
    buyChecked,
    checkedCount,
    modalVisible,
    setModalVisible,
    editingQty,
    qtyDraft,
    setQtyDraft,
    unitDraft,
    setUnitDraft,
    openQtyEditor,
    saveQty,
    closeQtyEditor,
  };
}
