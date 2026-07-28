import { Pressable, ScrollView, Text, View } from 'react-native';

import type { TodayPriorityProduct } from '@recetas/shared';

import { colors } from '@recetas/theme/tokens';

// Horizontal strip of products to consume soon. Red dot = priority, amber = consume_soon.
// Tapping one opens the discoverer with that ingredient already picked.
export function PriorityProductsStrip({
  products,
  onPressProduct,
}: {
  products: TodayPriorityProduct[];
  onPressProduct: (canonicalIngredientId: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-stack-md pr-container-padding">
      {products.map((product, i) => (
        <Pressable
          key={i}
          onPress={() => onPressProduct(product.canonicalIngredientId)}
          className="flex-row items-center gap-stack-sm border border-outline-variant bg-surface-container-low px-stack-lg py-gutter active:bg-surface-container">
          <View
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: product.status === 'priority' ? colors.error : colors.tertiary }}
          />
          <Text className="font-sans-medium text-body-md text-on-surface">{product.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
