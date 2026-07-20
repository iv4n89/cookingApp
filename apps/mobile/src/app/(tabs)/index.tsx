import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { AskAiModal } from '@/components/ask-ai-modal';
import { RecipeCard, type RecipeCardData } from '@/components/recipe-card';
import { askRecipe, recommendedRecipes, type RecommendedRecipe } from '@/lib/recipes';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

function toCardData(recipe: RecommendedRecipe): RecipeCardData {
  const total = recipe.prep_time_min + recipe.cook_time_min;
  return {
    id: recipe.id,
    image: recipe.image_url,
    badgeIcon: 'kitchen',
    badge: `${recipe.match_count} EN TU DESPENSA`,
    title: recipe.title,
    description: recipe.description,
    tags: [...recipe.tags.slice(0, 2).map((t) => t.toUpperCase()), `${total} MIN`],
  };
}

function AskInput({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Pregunta a la IA"
      className="flex-row items-center gap-stack-md rounded-xl border border-outline-variant bg-surface-container-lowest px-gutter py-gutter">
      <MaterialIcons name="chat-bubble-outline" size={22} color={colors.primary} />
      <Text className="flex-1 font-sans text-body-lg text-on-surface-variant">Pregunta a la IA…</Text>
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary">
        <MaterialIcons name="arrow-forward" size={20} color={colors['on-primary']} />
      </View>
    </Pressable>
  );
}

function SectionHeader({ title, action }: { title: string; action: string }) {
  return (
    <View className="mb-stack-lg flex-row items-center justify-between">
      <Text className="font-sans-semibold text-headline-md text-on-surface">{title}</Text>
      <Pressable className="flex-row items-center gap-stack-sm">
        <Text className="font-mono-medium text-label-md text-primary">{action}</Text>
        <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
      </Pressable>
    </View>
  );
}

function CriticalStockCard() {
  const items = [
    { name: 'Yogur griego', left: '150 g' },
    { name: 'Tomate San Marzano', left: '1 lata' },
  ];
  return (
    <View className="rounded-xl border border-card-border bg-card p-stack-lg">
      <View className="mb-stack-md self-start bg-primary-container px-stack-md py-stack-sm">
        <Text className="font-mono-medium text-label-sm text-on-primary-container">STOCK CRÍTICO</Text>
      </View>
      <Text className="mb-stack-md font-sans-semibold text-headline-sm text-on-surface">
        Se acaban básicos
      </Text>
      <View className="gap-stack-md">
        {items.map((item) => (
          <View key={item.name} className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-stack-md">
              <View className="h-2 w-2 rounded-full bg-error" />
              <Text className="font-sans text-body-md text-on-surface">{item.name}</Text>
            </View>
            <Text className="font-sans text-body-md text-on-surface-variant">{item.left}</Text>
          </View>
        ))}
      </View>
      <Pressable className="mt-stack-lg items-center border-[1.5px] border-primary py-stack-md">
        <Text className="font-mono-medium text-label-md text-primary">AÑADIR A LA COMPRA</Text>
      </Pressable>
    </View>
  );
}

function ExpiringCard() {
  return (
    <View className="rounded-xl border border-card-border bg-card p-stack-lg">
      <MaterialIcons name="timer" size={28} color={colors.secondary} />
      <Text className="mb-stack-sm mt-stack-md font-sans-semibold text-headline-sm text-on-surface">
        Caduca pronto
      </Text>
      <Text className="mb-stack-lg font-sans text-body-md text-on-surface-variant">
        Usa las espinacas frescas en 48 h para el mejor sabor.
      </Text>
      <View className="self-start bg-tertiary-fixed px-stack-md py-stack-sm">
        <Text className="font-mono-medium text-label-sm text-on-tertiary-fixed">EN 3 RECETAS</Text>
      </View>
    </View>
  );
}

function QuickAddCard() {
  return (
    <View className="items-center justify-center rounded-xl border-2 border-dashed border-card-border bg-card p-stack-lg">
      <MaterialIcons name="add-circle-outline" size={36} color={colors.outline} />
      <Text className="mt-stack-md text-center font-mono-medium text-label-md text-on-surface-variant">
        Escanear ticket o{'\n'}añadir a mano
      </Text>
    </View>
  );
}

export default function InicioScreen() {
  const [askVisible, setAskVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<RecommendedRecipe[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  const loadSuggestions = useCallback(() => {
    let active = true;
    setLoadingSuggestions(true);
    recommendedRecipes()
      .then((data) => {
        if (active) setSuggestions(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingSuggestions(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => loadSuggestions(), [loadSuggestions]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-container-padding pb-section-gap pt-stack-lg gap-section-gap">
        <View className="gap-stack-md">
          <Text className="font-mono-medium text-label-md uppercase tracking-widest text-secondary">
            Buenos días, chef
          </Text>
          <Text className="font-sans-bold text-display-lg text-on-surface">¿Qué cocinamos hoy?</Text>
          <Pressable
            onPress={() => router.push('/premium')}
            className="mt-stack-sm flex-row items-center gap-stack-md self-start rounded-lg border border-outline-variant bg-secondary-container px-stack-md py-stack-sm">
            <MaterialIcons name="workspace-premium" size={18} color={colors['on-secondary-container']} />
            <Text className="font-mono-medium text-label-sm text-on-secondary-container">
              PLAN PREMIUM • 2,99 €/MES
            </Text>
          </Pressable>
        </View>

        <AskInput onPress={() => setAskVisible(true)} />

        <View>
          <SectionHeader title="Tu despensa" action="VER TODO" />
          <View className="gap-gutter">
            <CriticalStockCard />
            <ExpiringCard />
            <QuickAddCard />
          </View>
        </View>

        <View>
          <SectionHeader title="Para tu despensa" action="VER MÁS" />
          {loadingSuggestions ? (
            <ActivityIndicator color={colors.primary} className="py-stack-lg" />
          ) : suggestions.length === 0 ? (
            <View className="items-center gap-stack-md rounded-xl border border-dashed border-card-border bg-card p-stack-lg">
              <MaterialIcons name="kitchen" size={32} color={colors['outline-variant']} />
              <Text className="text-center font-sans text-body-md text-on-surface-variant">
                Añade ingredientes a tu despensa para ver recetas que puedes cocinar.
              </Text>
            </View>
          ) : (
            <View className="gap-gutter">
              {suggestions.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={toCardData(recipe)}
                  onPress={() => router.push({ pathname: '/receta/[id]', params: { id: recipe.id } })}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <AskAiModal
        visible={askVisible}
        onClose={() => setAskVisible(false)}
        onSubmit={async (question) => {
          const { recipe } = await askRecipe(question);
          if (recipe) router.push({ pathname: '/receta/[id]', params: { id: recipe.id } });
        }}
      />
    </SafeAreaView>
  );
}
