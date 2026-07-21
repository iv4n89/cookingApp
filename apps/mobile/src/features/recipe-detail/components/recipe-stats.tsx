import { Text, View } from 'react-native';

import type { Recipe } from '@/lib/recipes';

// Grid of headline numbers for the recipe (servings, prep, cook, calories).
export function RecipeStats({ recipe, servings }: { recipe: Recipe; servings: number }) {
  const tiles = [
    { label: 'RACIONES', value: String(servings) },
    { label: 'PREP', value: `${recipe.prep_time_min} MIN` },
    { label: 'COCCIÓN', value: `${recipe.cook_time_min} MIN` },
    { label: 'CALORÍAS', value: recipe.calories ? `${recipe.calories}` : '—' },
  ];
  return (
    <View className="flex-row flex-wrap gap-gutter border-t border-outline-variant pt-stack-lg">
      {tiles.map((tile) => (
        <View
          key={tile.label}
          className="flex-1 basis-[45%] items-center border border-outline-variant bg-surface p-gutter">
          <Text className="mb-stack-sm font-mono text-label-sm text-on-surface-variant">{tile.label}</Text>
          <Text className="font-sans-semibold text-headline-sm text-primary">{tile.value}</Text>
        </View>
      ))}
    </View>
  );
}
