import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, View } from 'react-native';

import { useRecipeImage } from '@/lib/recipe-image';
import type { Recipe } from '@/lib/recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Hero image at the top of the recipe detail: image when ready, spinner while it is being
// generated, placeholder when there won't be one.
export function RecipeHero({ recipe }: { recipe: Recipe }) {
  const { image, pending } = useRecipeImage(recipe.id, recipe.image_url, recipe.image_status);
  return (
    <View className="relative aspect-[3/2] w-full items-center justify-center bg-surface-container">
      {image ? (
        <Image source={image} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : pending ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <MaterialIcons name="restaurant-menu" size={48} color={colors['outline-variant']} />
      )}
    </View>
  );
}
