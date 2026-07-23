import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import type { Recipe } from '@/lib/recipes';

import { colors } from '@recetas/theme/tokens';

// Quick facts under the title: total time and number of servings.
export function RecipeMetaRow({ recipe, servings }: { recipe: Recipe; servings: number }) {
  const total = recipe.prep_time_min + recipe.cook_time_min;
  return (
    <View className="flex-row flex-wrap items-center gap-gutter">
      <View className="flex-row items-center gap-stack-sm">
        <MaterialIcons name="schedule" size={18} color={colors['on-surface-variant']} />
        <Text className="font-mono-medium text-label-md text-on-surface-variant">{total} MIN</Text>
      </View>
      <View className="flex-row items-center gap-stack-sm">
        <MaterialIcons name="restaurant" size={18} color={colors['on-surface-variant']} />
        <Text className="font-mono-medium text-label-md text-on-surface-variant">{servings} RACIONES</Text>
      </View>
    </View>
  );
}
