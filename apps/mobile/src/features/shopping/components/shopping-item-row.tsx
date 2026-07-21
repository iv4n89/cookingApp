import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';

import { Checkbox } from '@/components/checkbox';
import type { ShoppingItem } from '@/lib/shopping';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

function detailLine(item: ShoppingItem) {
  const parts = [item.quantity, item.unit].filter((value) => value !== null && value !== '');
  return parts.length ? parts.join(' ') : null;
}

// A shopping list row: checkbox to mark as bought and a chip to edit quantity/unit.
export function ShoppingItemRow({
  item,
  onToggle,
  onEditQty,
}: {
  item: ShoppingItem;
  onToggle: (checked: boolean) => void;
  onEditQty: () => void;
}) {
  const detail = detailLine(item);
  return (
    <Pressable
      onPress={() => onToggle(!item.checked)}
      className="flex-row items-center gap-gutter rounded-lg border border-outline-variant bg-surface-container-low p-gutter">
      <Checkbox checked={item.checked} onToggle={() => onToggle(!item.checked)} />
      <Text
        className={`flex-1 font-sans-medium text-body-md ${
          item.checked ? 'text-on-surface-variant line-through' : 'text-on-surface'
        }`}>
        {item.name}
      </Text>
      <Pressable
        onPress={onEditQty}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Editar cantidad"
        className="flex-row items-center gap-stack-sm border border-outline-variant px-stack-md py-stack-sm">
        <Text className="font-mono text-label-sm text-on-surface">{detail ?? 'Cantidad'}</Text>
        <MaterialIcons name="edit" size={14} color={colors.outline} />
      </Pressable>
    </Pressable>
  );
}
