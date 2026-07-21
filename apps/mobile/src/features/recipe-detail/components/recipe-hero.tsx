import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { View } from 'react-native';

import type { Recipe } from '@/lib/recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Hero image at the top of the recipe detail, with a placeholder when there is no image yet.
export function RecipeHero({ recipe }: { recipe: Recipe }) {
  return (
    <View className="relative aspect-[3/2] w-full items-center justify-center bg-surface-container">
      {recipe.image_url ? (
        <Image source={recipe.image_url} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <MaterialIcons name="restaurant-menu" size={48} color={colors['outline-variant']} />
      )}
    </View>
  );
}
