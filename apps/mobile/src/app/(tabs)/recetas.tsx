import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { RecipeCard, type RecipeCardData } from '@/components/recipe-card';
import { FavoriteRow } from '@/features/favorites/components/favorite-row';
import { useFavorites } from '@/features/favorites/hooks/use-favorites';
import { RecipeFilters } from '@/features/recipe-book/components/recipe-filters';
import { useRecipeBook } from '@/features/recipe-book/hooks/use-recipe-book';
import type { Recipe } from '@/lib/recipes';

import { colors } from '@recetas/theme/tokens';

// The recipe book shows the catalog, so there is no pantry cross-check here: cards carry a neutral
// badge instead of a missing-ingredients one.
function toCardData(recipe: Recipe): RecipeCardData {
  return {
    id: recipe.id,
    image: recipe.image_url,
    imageStatus: recipe.image_status,
    badge: 'RECETA',
    badgeIcon: 'menu-book',
    title: recipe.title,
    description: recipe.description,
    tags: [],
  };
}

export default function RecetasScreen() {
  const [tab, setTab] = useState<'todas' | 'guardadas'>('todas');
  const { filters, setFilters, recipes, loading, loadingMore, loadMore } = useRecipeBook();
  const { entries, loading: loadingFavorites } = useFavorites();

  const openRecipe = (id: string) => router.push({ pathname: '/receta/[id]', params: { id } });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />

      <View className="flex-row gap-stack-sm px-container-padding pt-stack-lg">
        {(['todas', 'guardadas'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            className={`flex-1 border-b-2 pb-stack-md ${
              tab === value ? 'border-primary' : 'border-outline-variant'
            }`}>
            <Text
              className={`text-center font-mono-medium text-label-md uppercase ${
                tab === value ? 'text-primary' : 'text-on-surface-variant'
              }`}>
              {value === 'todas' ? 'Todas' : 'Guardadas'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'todas' ? (
        <FlatList
          data={recipes}
          keyExtractor={(recipe) => recipe.id}
          className="flex-1"
          contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-gutter"
          ListHeaderComponent={
            <View className="mb-gutter">
              <RecipeFilters filters={filters} onChange={setFilters} />
            </View>
          }
          renderItem={({ item }) => (
            <RecipeCard recipe={toCardData(item)} onPress={() => openRecipe(item.id)} />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            loading ? null : (
              <Text className="text-center font-sans text-body-md text-on-surface-variant">
                No hay recetas con esos filtros.
              </Text>
            )
          }
          ListFooterComponent={
            loading || loadingMore ? (
              <ActivityIndicator color={colors.primary} className="py-stack-lg" />
            ) : null
          }
        />
      ) : loadingFavorites ? (
        <ActivityIndicator color={colors.primary} className="mt-section-gap" />
      ) : entries.length === 0 ? (
        <View className="mt-section-gap items-center gap-stack-md px-container-padding">
          <MaterialIcons name="bookmark-border" size={40} color={colors['outline-variant']} />
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            Aún no tienes recetas guardadas.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(recipe) => recipe.id}
          className="flex-1"
          contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-stack-md"
          renderItem={({ item }) => (
            <FavoriteRow recipe={item} onPress={() => openRecipe(item.id)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}
