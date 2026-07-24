import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { TodayRecipeCard } from '@recetas/shared';
import { useRecipeImage } from '@/lib/recipe-image';
import { reasonLabels } from '@/features/home/today-reasons';

import { colors } from '@recetas/theme/tokens';

export function FeaturedRecipeCard({ recipe, onPress }: { recipe: TodayRecipeCard; onPress: () => void }) {
  const { image, pending } = useRecipeImage(recipe.recipeId, recipe.imageUrl, recipe.imageStatus);
  const ready = recipe.mode === 'cook_now';
  const reasons = reasonLabels(recipe.reasons);
  return (
    <Pressable onPress={onPress} className="mx-container-padding overflow-hidden rounded-xl border border-card-border bg-card">
      {image || pending ? (
        <View className="h-64 w-full items-center justify-center bg-surface-container">
          {image ? (
            <Image source={image} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      ) : null}
      <View className="gap-stack-md p-stack-lg">
        <View className="flex-row items-center gap-stack-sm bg-tertiary-fixed self-start px-stack-md py-stack-sm">
          <MaterialIcons name={ready ? 'restaurant' : 'shopping-cart'} size={14} color={colors['on-tertiary-fixed']} />
          <Text className="font-mono-medium text-label-sm text-on-tertiary-fixed">
            {ready ? 'LISTA PARA COCINAR' : `TE FALTA${recipe.missingIngredientCount === 1 ? '' : 'N'} ${recipe.missingIngredientCount}`}
          </Text>
        </View>
        <Text className="font-sans-bold text-headline-sm text-primary">{recipe.title}</Text>
        {reasons.length ? (
          <Text className="font-sans text-body-md text-on-surface-variant">{reasons.join(' · ')}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
