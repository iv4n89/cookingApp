import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';

import { RecipeCard, type RecipeCardData } from '@/components/recipe-card';
import type { RecommendedRecipe } from '@/lib/recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

function toCardData(recipe: RecommendedRecipe): RecipeCardData {
  const total = recipe.prep_time_min + recipe.cook_time_min;
  const cookable = recipe.missing_count === 0;
  return {
    id: recipe.id,
    image: recipe.image_url,
    badgeIcon: cookable ? 'check-circle' : 'shopping-cart',
    badge: cookable ? 'LISTA PARA COCINAR' : `TE FALTAN ${recipe.missing_count}`,
    title: recipe.title,
    description: recipe.description,
    tags: [...recipe.tags.slice(0, 2).map((t) => t.toUpperCase()), `${total} MIN`],
  };
}

// Recipes recommended for what's in the pantry: loading spinner, empty state or the card list.
export function HomeSuggestions({
  loading,
  suggestions,
  saved,
  onToggleSave,
  onOpen,
}: {
  loading: boolean;
  suggestions: RecommendedRecipe[];
  saved: Set<string>;
  onToggleSave: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (loading) {
    return <ActivityIndicator color={colors.primary} className="py-stack-lg" />;
  }
  if (suggestions.length === 0) {
    return (
      <View className="items-center gap-stack-md rounded-xl border border-dashed border-card-border bg-card p-stack-lg">
        <MaterialIcons name="kitchen" size={32} color={colors['outline-variant']} />
        <Text className="text-center font-sans text-body-md text-on-surface-variant">
          Añade ingredientes a tu despensa para ver recetas que puedes cocinar.
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-gutter">
      {suggestions.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={toCardData(recipe)}
          saved={saved.has(recipe.id)}
          onToggleSave={() => onToggleSave(recipe.id)}
          onPress={() => onOpen(recipe.id)}
        />
      ))}
    </View>
  );
}
