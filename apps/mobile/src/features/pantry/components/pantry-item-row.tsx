import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { detailLine, isLowStock } from '@/features/pantry/pantry-item';
import type { PantryItem } from '@/lib/pantry';

import { colors } from '@recetas/theme/tokens';

function Stepper({
  item,
  onChange,
  onEdit,
}: {
  item: PantryItem;
  onChange: (next: number) => void;
  onEdit: () => void;
}) {
  const value = item.quantity ?? 0;
  return (
    <View className="flex-row items-center gap-stack-md">
      <Pressable
        onPress={() => onChange(Math.max(0, value - 1))}
        className="h-8 w-8 items-center justify-center rounded-full border border-outline-variant">
        <MaterialIcons name="remove" size={16} color={colors['on-surface']} />
      </Pressable>
      <Pressable onPress={onEdit} hitSlop={6} accessibilityLabel="Editar cantidad">
        <Text
          numberOfLines={1}
          className="min-w-[3rem] px-stack-sm text-center font-mono-medium text-label-md text-on-surface">
          {value}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange(value + 1)}
        className="h-8 w-8 items-center justify-center rounded-full border border-outline-variant">
        <MaterialIcons name="add" size={16} color={colors['on-surface']} />
      </Pressable>
    </View>
  );
}

// A pantry item card: name, amount, quantity stepper, low-stock badge, minimum editor and delete.
export function PantryItemRow({
  item,
  onChangeQuantity,
  onEditQuantity,
  onEditMin,
  onRemove,
}: {
  item: PantryItem;
  onChangeQuantity: (next: number) => void;
  onEditQuantity: () => void;
  onEditMin: () => void;
  onRemove: () => void;
}) {
  return (
    <View className="gap-stack-md border border-card-border bg-card p-gutter">
      <View className="flex-row items-start justify-between gap-stack-md">
        <Text className="flex-1 font-sans-semibold text-body-md text-primary">{item.name}</Text>
        <Text className="font-mono text-label-sm text-on-surface-variant">{detailLine(item)}</Text>
      </View>
      <View className="flex-row items-center justify-between">
        <Stepper item={item} onChange={onChangeQuantity} onEdit={onEditQuantity} />
        <View className="flex-row items-center gap-stack-md">
          {isLowStock(item) ? (
            <View
              accessibilityRole="image"
              accessibilityLabel="Stock bajo"
              className="h-7 w-7 items-center justify-center rounded-full bg-error">
              <MaterialIcons name="shopping-cart" size={15} color={colors['on-error']} />
            </View>
          ) : null}
          <Pressable onPress={onEditMin} hitSlop={8} className="flex-row items-center gap-stack-sm">
            <MaterialIcons name="flag" size={16} color={colors.outline} />
            <Text className="font-mono text-label-sm text-on-surface-variant">
              {item.min_stock != null ? `mín ${item.min_stock}` : 'mín —'}
            </Text>
          </Pressable>
          <Pressable onPress={onRemove} hitSlop={8}>
            <MaterialIcons name="delete-outline" size={20} color={colors.outline} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
