import { Text, View } from 'react-native';

import type { PantryItem } from '@/lib/pantry';

import { PantryItemRow } from './pantry-item-row';

// Pantry items grouped by category, each group with a header and a count.
export function PantryList({
  groups,
  onSetQuantity,
  onEditMin,
  onRemove,
}: {
  groups: [string, PantryItem[]][];
  onSetQuantity: (id: string, next: number) => void;
  onEditMin: (item: PantryItem) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <View className="gap-stack-lg">
      {groups.map(([category, categoryItems]) => (
        <View key={category} className="gap-stack-md">
          <View className="flex-row items-center justify-between border-b border-outline-variant pb-stack-md">
            <Text className="font-sans-semibold text-headline-sm text-primary">{category}</Text>
            <View className="rounded bg-surface-container px-stack-md py-stack-sm">
              <Text className="font-mono text-label-sm text-on-surface-variant">{categoryItems.length} ITEMS</Text>
            </View>
          </View>
          <View className="gap-stack-sm">
            {categoryItems.map((item) => (
              <PantryItemRow
                key={item.id}
                item={item}
                onChangeQuantity={(next) => onSetQuantity(item.id, next)}
                onEditMin={() => onEditMin(item)}
                onRemove={() => onRemove(item.id)}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
