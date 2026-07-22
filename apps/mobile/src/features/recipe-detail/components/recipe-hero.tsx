import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ensureRecipeImage, useRecipeImage } from '@/lib/recipe-image';
import type { ImageStatus, Recipe } from '@/lib/recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Hero image at the top of the recipe detail. Unlike list cards, the detail always wants an
// image: if the recipe has none (e.g. chat recipes, which aren't generated up front), it asks
// the backend to generate one on open and then polls until it's ready.
export function RecipeHero({ recipe }: { recipe: Recipe }) {
  const needsImage = !recipe.image_url && recipe.image_status !== 'ready';
  const [status, setStatus] = useState<ImageStatus>(recipe.image_status);
  const [ensuring, setEnsuring] = useState(needsImage);

  useEffect(() => {
    if (!needsImage) return;
    let cancelled = false;
    ensureRecipeImage(recipe.id).then((next) => {
      if (cancelled) return;
      setStatus(next);
      setEnsuring(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe.id]);

  // Drive the spinner from `status` (updated in the same render as `ensuring`), not from the
  // hook's `pending`, which only syncs in a post-render effect and would flash the placeholder
  // for one frame during the ensuring -> pending transition.
  const { image } = useRecipeImage(recipe.id, recipe.image_url, status);
  const showSpinner = !image && (ensuring || status === 'pending');

  return (
    <View className="relative aspect-[3/2] w-full items-center justify-center bg-surface-container">
      {image ? (
        <Image source={image} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : showSpinner ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <MaterialIcons name="restaurant-menu" size={48} color={colors['outline-variant']} />
      )}
    </View>
  );
}
