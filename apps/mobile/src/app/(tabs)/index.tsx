import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TodayDecision, TodayRecipeCard } from '@recetas/shared';
import { AppHeader } from '@/components/app-header';
import { AskAiModal } from '@/components/ask-ai-modal';
import { RecipeCard, type RecipeCardData } from '@/components/recipe-card';
import type { TasteRecipeCard } from '@/lib/recipes';
import { FeaturedRecipeCard } from '@/features/home/components/featured-recipe-card';
import { HomeAskInput } from '@/features/home/components/home-ask-input';
import { HomeSectionHeader } from '@/features/home/components/home-section-header';
import { PriorityProductsStrip } from '@/features/home/components/priority-products-strip';
import { useHome } from '@/features/home/hooks/use-home';

import { colors } from '@recetas/theme/tokens';

// Maps a recommendation card to the shared RecipeCard shape used for the smaller alternatives.
function toCardData(card: TodayRecipeCard): RecipeCardData {
  const badge =
    card.mode === 'cook_now'
      ? { badge: 'LISTA PARA COCINAR', badgeIcon: 'check-circle' as const }
      : {
          badge: card.missingIngredientCount === 1 ? 'TE FALTA 1' : `TE FALTAN ${card.missingIngredientCount}`,
          badgeIcon: 'shopping-cart' as const,
        };
  return {
    id: card.recipeId,
    image: card.imageUrl,
    imageStatus: card.imageStatus,
    ...badge,
    title: card.title,
    description: '',
    tags: [],
  };
}

// Maps a taste recommendation to the RecipeCard shape. No pantry badge here: the "Para ti" carousel
// is discovery by style, so it carries a fixed "PARA TI" badge instead of a missing-count badge.
function toTasteCardData(card: TasteRecipeCard): RecipeCardData {
  return {
    id: card.recipeId,
    image: card.imageUrl,
    imageStatus: card.imageStatus,
    badge: 'PARA TI',
    badgeIcon: 'favorite',
    title: card.title,
    description: '',
    tags: [],
  };
}

// Message shown when there is no recipe to feature, tailored to why the engine could not pick one.
function emptyMessage(reason: TodayDecision['decisionReason'] | undefined): string {
  if (reason === 'unsupported_household_restriction') {
    return 'Tienes una restricción que aún no sabemos manejar; revisa tus preferencias.';
  }
  if (reason === 'no_safe_candidate') {
    return 'No encontramos una receta segura con tu despensa y preferencias.';
  }
  return 'Añade ingredientes a tu despensa para ver qué puedes cocinar.';
}

export default function InicioScreen() {
  const [askVisible, setAskVisible] = useState(false);
  const { decision, forYou, loading, refreshing, refresh, meal, greetingText, saved, toggleSave } = useHome();

  const openRecipe = (id: string) => router.push({ pathname: '/receta/[id]', params: { id } });
  const priority = decision?.priorityProducts ?? [];
  const featured = decision?.pantry.featured ?? null;
  const alternatives = decision?.pantry.alternatives ?? [];
  const discover = decision?.discover ?? [];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-container-padding pb-section-gap pt-stack-lg gap-section-gap"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }>
        <View className="gap-stack-md">
          <Text className="font-mono-medium text-label-md uppercase tracking-widest text-secondary">
            {greetingText}, chef
          </Text>
          <Text className="font-sans-bold text-display-lg text-on-surface">¿Qué cocinamos hoy?</Text>
        </View>

        <HomeAskInput onPress={() => setAskVisible(true)} />

        {priority.length > 0 ? (
          <View>
            <HomeSectionHeader title="Productos a consumir" action="VER TODO" onAction={() => router.push('/alacena')} />
            <PriorityProductsStrip products={priority} />
          </View>
        ) : null}

        <View>
          <HomeSectionHeader title={priority.length > 0 ? 'Cocina esto hoy' : `Ideas para tu ${meal}`} />
          {loading ? (
            <ActivityIndicator color={colors.primary} className="py-stack-lg" />
          ) : featured ? (
            <FeaturedRecipeCard recipe={featured} onPress={() => openRecipe(featured.recipeId)} />
          ) : (
            <View className="items-center gap-stack-md rounded-xl border border-dashed border-card-border bg-card p-stack-lg">
              <Text className="text-center font-sans text-body-md text-on-surface-variant">
                {emptyMessage(decision?.decisionReason)}
              </Text>
            </View>
          )}
        </View>

        {alternatives.length > 0 ? (
          <View>
            <HomeSectionHeader title="Más con tu despensa" />
            <View className="gap-gutter">
              {alternatives.map((card) => (
                <RecipeCard
                  key={card.recipeId}
                  recipe={toCardData(card)}
                  saved={saved.has(card.recipeId)}
                  onToggleSave={() => toggleSave(card.recipeId)}
                  onPress={() => openRecipe(card.recipeId)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {discover.length > 0 ? (
          <View>
            <HomeSectionHeader title="Descubre" />
            <View className="gap-gutter">
              {discover.map((card) => (
                <RecipeCard
                  key={card.recipeId}
                  recipe={toCardData(card)}
                  saved={saved.has(card.recipeId)}
                  onToggleSave={() => toggleSave(card.recipeId)}
                  onPress={() => openRecipe(card.recipeId)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {forYou.length > 0 ? (
          <View>
            <HomeSectionHeader title="Para ti" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-gutter pr-container-padding">
              {forYou.map((card) => (
                <View key={card.recipeId} className="w-72">
                  <RecipeCard
                    recipe={toTasteCardData(card)}
                    saved={saved.has(card.recipeId)}
                    onToggleSave={() => toggleSave(card.recipeId)}
                    onPress={() => openRecipe(card.recipeId)}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      <AskAiModal
        visible={askVisible}
        onClose={() => setAskVisible(false)}
        onSubmit={(question) => router.push({ pathname: '/chat', params: { q: question, t: String(Date.now()) } })}
      />
    </SafeAreaView>
  );
}
