import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { AskAiModal } from '@/components/ask-ai-modal';
import { RecipeCard, type RecipeCardData } from '@/components/recipe-card';
import { useSession } from '@/lib/auth';
import { getPantrySummary, type PantrySummary } from '@/lib/pantry';
import {
  addIngredientsToShopping,
  recommendedRecipes,
  type RecommendedRecipe,
} from '@/lib/recipes';
import { listFavorites, setFavorite } from '@/lib/user-recipes';

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

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View className="mb-stack-lg flex-row items-center justify-between">
      <Text className="font-sans-semibold text-headline-md text-on-surface">{title}</Text>
      {action ? (
        <Pressable onPress={onAction} className="flex-row items-center gap-stack-sm">
          <Text className="font-mono-medium text-label-md text-primary">{action}</Text>
          <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function formatAmount(item: PantrySummary['low'][number]): string {
  return item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
}

function PantryCard({
  summary,
  onAddToShopping,
  adding,
  added,
}: {
  summary: PantrySummary;
  onAddToShopping: () => void;
  adding: boolean;
  added: boolean;
}) {
  return (
    <View className="gap-stack-md rounded-xl border border-card-border bg-card p-stack-lg">
      <View className="flex-row items-center gap-stack-md">
        <MaterialIcons name="kitchen" size={24} color={colors.primary} />
        <Text className="font-sans-semibold text-headline-sm text-on-surface">
          {summary.count} {summary.count === 1 ? 'ingrediente' : 'ingredientes'}
        </Text>
      </View>
      {summary.count === 0 ? (
        <Text className="font-sans text-body-md text-on-surface-variant">
          Aún no tienes nada en la despensa.
        </Text>
      ) : summary.low.length > 0 ? (
        <View className="gap-stack-md border-t border-outline-variant pt-stack-md">
          <Text className="font-mono uppercase tracking-wider text-label-sm text-on-surface-variant">
            Por reponer (bajo mínimo)
          </Text>
          {summary.low.map((item) => (
            <View key={item.id} className="flex-row items-center justify-between">
              <Text className="font-sans text-body-md text-on-surface">{item.name}</Text>
              <Text className="font-sans text-body-md text-on-surface-variant">{formatAmount(item)}</Text>
            </View>
          ))}
          <Pressable
            onPress={onAddToShopping}
            disabled={adding || added}
            className={`mt-stack-sm items-center border-[1.5px] border-primary py-stack-md ${
              adding || added ? 'opacity-60' : ''
            }`}>
            <Text className="font-mono-medium text-label-md text-primary">
              {added ? 'AÑADIDO A LA COMPRA' : adding ? 'AÑADIENDO…' : 'AÑADIR A LA COMPRA'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function QuickAddCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Añadir a la despensa"
      className="flex-row items-center justify-center gap-stack-md rounded-xl border-2 border-dashed border-card-border bg-card p-stack-lg">
      <MaterialIcons name="add-circle-outline" size={24} color={colors.primary} />
      <Text className="font-mono-medium text-label-md text-primary">AÑADIR A LA DESPENSA</Text>
    </Pressable>
  );
}

export default function InicioScreen() {
  const { session } = useSession();
  const [askVisible, setAskVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<RecommendedRecipe[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [pantry, setPantry] = useState<PantrySummary | null>(null);
  const [addingLow, setAddingLow] = useState(false);
  const [addedLow, setAddedLow] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  // Toggles de guardado en vuelo, para ignorar taps repetidos mientras se resuelve.
  const savingIds = useRef<Set<string>>(new Set());

  const load = useCallback(() => {
    let active = true;
    setLoadingSuggestions(true);
    setAddedLow(false);
    recommendedRecipes()
      .then((data) => {
        if (active) setSuggestions(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingSuggestions(false);
      });
    getPantrySummary()
      .then((data) => {
        if (active) setPantry(data);
      })
      .catch(() => {});
    listFavorites()
      .then((favorites) => {
        if (active) setSaved(new Set(favorites.map((favorite) => favorite.id)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  async function toggleSave(id: string) {
    if (!session || savingIds.current.has(id)) return;
    savingIds.current.add(id);
    const wasSaved = saved.has(id);
    setSaved((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      await setFavorite(session.user.id, id, !wasSaved);
    } catch {
      setSaved((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(id);
        else next.delete(id);
        return next;
      });
    } finally {
      savingIds.current.delete(id);
    }
  }

  async function addLowToShopping() {
    if (!session || !pantry || addingLow || addedLow || pantry.low.length === 0) return;
    setAddingLow(true);
    try {
      await addIngredientsToShopping(
        session.user.id,
        pantry.low.map((item) => ({ name: item.name, quantity: null, unit: item.unit, substitutions: [] })),
      );
      setAddedLow(true);
    } catch {
      // se ignora; el usuario puede reintentar
    } finally {
      setAddingLow(false);
    }
  }

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
        </View>

        <AskInput onPress={() => setAskVisible(true)} />

        <View>
          <SectionHeader title="Tu despensa" action="VER TODO" onAction={() => router.push('/alacena')} />
          <View className="gap-gutter">
            {pantry ? (
              <PantryCard
                summary={pantry}
                onAddToShopping={addLowToShopping}
                adding={addingLow}
                added={addedLow}
              />
            ) : null}
            <QuickAddCard onPress={() => router.push('/alacena')} />
          </View>
        </View>

        <View>
          <SectionHeader title="Para tu despensa" />
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
                  saved={saved.has(recipe.id)}
                  onToggleSave={() => toggleSave(recipe.id)}
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
        onSubmit={(question) =>
          router.push({ pathname: '/chat', params: { q: question, t: String(Date.now()) } })
        }
      />
    </SafeAreaView>
  );
}
