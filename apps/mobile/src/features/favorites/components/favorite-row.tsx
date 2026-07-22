import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import type { FavoriteRecipe } from '@/lib/user-recipes';

import { FavoriteStars } from './favorite-stars';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// A favorite recipe row: title, total time and rating; opens the recipe on tap.
export function FavoriteRow({ recipe, onPress }: { recipe: FavoriteRecipe; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="gap-stack-sm rounded-lg border border-outline-variant bg-surface-container-low p-gutter">
      <View className="flex-row items-center justify-between gap-gutter">
        <Text className="flex-1 font-sans-semibold text-body-md text-on-surface">{recipe.title}</Text>
        <MaterialIcons name="chevron-right" size={22} color={colors.outline} />
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-label-sm text-on-surface-variant">
          {recipe.prep_time_min + recipe.cook_time_min} MIN
        </Text>
        <FavoriteStars rating={recipe.rating} />
      </View>
    </Pressable>
  );
}
