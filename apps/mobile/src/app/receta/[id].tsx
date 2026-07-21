import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ServingsStepper } from '@/components/servings-stepper';
import { IngredientList } from '@/features/recipe-detail/components/ingredient-list';
import { RatingStars } from '@/features/recipe-detail/components/rating-stars';
import { RecipeDetailMessage } from '@/features/recipe-detail/components/recipe-detail-message';
import { RecipeHero } from '@/features/recipe-detail/components/recipe-hero';
import { RecipeMetaRow } from '@/features/recipe-detail/components/recipe-meta-row';
import { RecipeStats } from '@/features/recipe-detail/components/recipe-stats';
import { RecipeStepItem } from '@/features/recipe-detail/components/recipe-step-item';
import { RecipeTopBar } from '@/features/recipe-detail/components/recipe-top-bar';
import { StartCookingButton } from '@/features/recipe-detail/components/start-cooking-button';
import { useRecipeDetail } from '@/features/recipe-detail/hooks/use-recipe-detail';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

export default function RecipeDetailScreen() {
  const { id, servings: servingsParam } = useLocalSearchParams<{ id: string; servings?: string }>();
  const {
    recipe,
    loading,
    failed,
    reload,
    servings,
    setServings,
    scaledIngredients,
    meta,
    toggleFavorite,
    rate,
    pantry,
    cooking,
    startCooking,
  } = useRecipeDetail(id, servingsParam);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <RecipeTopBar favorite={meta.is_favorite} onToggleFavorite={recipe ? toggleFavorite : undefined} />

      {loading ? (
        <ActivityIndicator color={colors.primary} className="mt-section-gap" />
      ) : failed ? (
        <RecipeDetailMessage icon="error-outline" text="No se pudo cargar la receta." onRetry={reload} />
      ) : !recipe ? (
        <RecipeDetailMessage icon="search-off" text="No se encontró la receta." />
      ) : (
        <View className="flex-1">
          <ScrollView className="flex-1" contentContainerClassName="pb-40">
            <RecipeHero recipe={recipe} />
            <View className="-mt-8 px-container-padding">
              <View className="gap-section-gap border border-outline-variant bg-surface-container-lowest p-stack-lg">
                <View className="gap-stack-md border-b border-outline-variant pb-stack-lg">
                  <Text className="font-sans-bold text-display-lg text-primary">{recipe.title}</Text>
                  <RecipeMetaRow recipe={recipe} servings={servings} />
                </View>

                {recipe.description ? (
                  <Text className="font-sans text-body-lg leading-relaxed text-on-surface-variant">
                    {recipe.description}
                  </Text>
                ) : null}

                <RatingStars rating={meta.rating} onRate={rate} />

                <ServingsStepper servings={servings} onChange={setServings} />

                <IngredientList key={servings} ingredients={scaledIngredients} pantry={pantry} />

                <View>
                  <Text className="mb-stack-md font-sans-semibold text-headline-sm uppercase tracking-wider text-primary">
                    Preparación
                  </Text>
                  <View className="gap-section-gap">
                    {recipe.steps.map((step, i) => (
                      <RecipeStepItem key={i} step={step} index={i} />
                    ))}
                  </View>
                </View>

                <RecipeStats recipe={recipe} servings={servings} />
              </View>
            </View>
          </ScrollView>

          <StartCookingButton cooking={cooking} onPress={startCooking} />
        </View>
      )}
    </SafeAreaView>
  );
}
