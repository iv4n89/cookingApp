import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { IngredientMultiSelect } from '@/features/discoverer/components/ingredient-multi-select';
import { RecipeReel } from '@/features/discoverer/components/recipe-reel';
import { useSession } from '@/lib/auth';
import { discoverByIngredients, type DiscoverCard } from '@/lib/recipes';
import { listFavoriteIds, setFavorite } from '@/lib/user-recipes';

import { colors } from '@recetas/theme/tokens';

const DOUBLE_TAP_MS = 300;

export default function DescubrirScreen() {
  const { session } = useSession();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Coming from a product about to expire on the Home: it arrives already picked, but only as a
  // starting point. Once the screen is mounted the selection belongs to the user.
  const { ingredientId } = useLocalSearchParams<{ ingredientId?: string }>();
  const [selected, setSelected] = useState<Set<string>>(() =>
    ingredientId ? new Set([ingredientId]) : new Set(),
  );
  const [cards, setCards] = useState<DiscoverCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const savingIds = useRef<Set<string>>(new Set());
  const pendingOpen = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pageHeight = height - insets.top - insets.bottom;

  useEffect(
    () => () => {
      if (pendingOpen.current) clearTimeout(pendingOpen.current);
    },
    [],
  );

  function cancelPendingOpen() {
    if (!pendingOpen.current) return false;
    clearTimeout(pendingOpen.current);
    pendingOpen.current = null;
    return true;
  }

  // A tap opens the recipe and a double tap saves it. Opening waits out the double-tap window,
  // since the first tap of a save looks exactly like a tap meant to open. Scrolling cancels the
  // wait: the timing lives here and not in the card so that swiping away does not land you on the
  // recipe you just left behind.
  function handleTap(recipeId: string) {
    if (cancelPendingOpen()) {
      save(recipeId);
      return;
    }
    pendingOpen.current = setTimeout(() => {
      pendingOpen.current = null;
      router.push({ pathname: '/receta/[id]', params: { id: recipeId } });
    }, DOUBLE_TAP_MS);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Going back to the selector starts fresh: ingredients from the previous search only get in the way.
  function restart() {
    setCards(null);
    setSelected(new Set());
    setSaved(new Set());
  }

  async function discover() {
    if (selected.size === 0 || loading) return;
    setLoading(true);
    try {
      const found = await discoverByIngredients([...selected]);
      // Already saved recipes show their bookmark. Secondary: if the lookup fails, cards still show.
      if (found.length > 0) {
        const ids = await listFavoriteIds(found.map((card) => card.recipeId)).catch(() => []);
        setSaved(new Set(ids));
      }
      setCards(found);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }

  async function save(recipeId: string) {
    if (!session || saved.has(recipeId) || savingIds.current.has(recipeId)) return;
    savingIds.current.add(recipeId);
    setSaved((prev) => new Set(prev).add(recipeId));
    try {
      await setFavorite(session.user.id, recipeId, true);
    } catch {
      setSaved((prev) => {
        const next = new Set(prev);
        next.delete(recipeId);
        return next;
      });
    } finally {
      savingIds.current.delete(recipeId);
    }
  }

  // Selection phase: pick ingredients and discover.
  if (cards === null) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
        <BackHeader title="Descubrir" />
        <IngredientMultiSelect selected={selected} onToggle={toggle} />
        <View className="border-t border-outline-variant px-container-padding py-stack-md">
          <Pressable
            onPress={discover}
            disabled={selected.size === 0 || loading}
            className={`items-center rounded-xl py-stack-lg ${
              selected.size === 0 || loading ? 'bg-surface-container' : 'bg-primary'
            }`}>
            {loading ? (
              <ActivityIndicator color={colors['on-primary']} />
            ) : (
              <Text
                className={`font-mono-medium text-label-md uppercase tracking-widest ${
                  selected.size === 0 ? 'text-on-surface-variant' : 'text-on-primary'
                }`}>
                Descubrir{selected.size > 0 ? ` (${selected.size})` : ''}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // No match: back to the selector.
  if (cards.length === 0) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
        <BackHeader title="Descubrir" />
        <View className="flex-1 items-center justify-center gap-stack-lg px-container-padding">
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            Ninguna receta encaja con esos ingredientes.
          </Text>
          <Pressable onPress={restart} className="rounded-xl bg-primary px-stack-lg py-stack-md">
            <Text className="font-mono-medium text-label-md uppercase tracking-widest text-on-primary">
              Cambiar ingredientes
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <FlatList
        data={cards}
        keyExtractor={(card) => card.recipeId}
        pagingEnabled
        snapToInterval={pageHeight}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={cancelPendingOpen}
        renderItem={({ item }) => (
          <RecipeReel
            card={item}
            height={pageHeight}
            saved={saved.has(item.recipeId)}
            onSave={() => save(item.recipeId)}
            onTap={() => handleTap(item.recipeId)}
          />
        )}
        ListFooterComponent={
          <View
            style={{ height: pageHeight }}
            className="items-center justify-center gap-stack-lg px-container-padding">
            <Text className="text-center font-sans text-body-md text-on-surface-variant">
              No hay más recetas con esos ingredientes.
            </Text>
            <Pressable
              onPress={restart}
              className="rounded-xl bg-primary px-stack-lg py-stack-md">
              <Text className="font-mono-medium text-label-md uppercase tracking-widest text-on-primary">
                Cambiar ingredientes
              </Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}
