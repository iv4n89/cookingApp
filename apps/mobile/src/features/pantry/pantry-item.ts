import type { PantryItem } from '@/lib/pantry';

// A pantry item runs low when its quantity reaches or drops below the configured minimum.
export function isLowStock(item: PantryItem) {
  return item.quantity !== null && item.min_stock !== null && item.quantity <= item.min_stock;
}

// Compact "quantity unit" line for a pantry item, or an em dash when there's nothing to show.
export function detailLine(item: PantryItem) {
  const parts = [item.quantity, item.unit].filter((value) => value !== null && value !== '');
  return parts.length ? parts.join(' ') : '—';
}
