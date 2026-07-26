import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { IngredientMultiSelect } from '@/features/discoverer/components/ingredient-multi-select';
import { RecipeReel } from '@/features/discoverer/components/recipe-reel';
import { useSession } from '@/lib/auth';
import { discoverByIngredients, type DiscoverCard } from '@/lib/recipes';
import { listFavoriteIds, setFavorite } from '@/lib/user-recipes';

import { colors } from '@recetas/theme/tokens';

export default function DescubrirScreen() {
  const { session } = useSession();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cards, setCards] = useState<DiscoverCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const savingIds = useRef<Set<string>>(new Set());

  const pageHeight = height - insets.top - insets.bottom;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Volver al selector empieza de cero: los ingredientes de la búsqueda anterior estorban.
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
      // Las que el usuario ya tenía guardadas salen con el marcador puesto. Es secundario: si la
      // consulta falla, las cards se muestran igual.
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
        renderItem={({ item }) => (
          <RecipeReel
            card={item}
            height={pageHeight}
            saved={saved.has(item.recipeId)}
            onSave={() => save(item.recipeId)}
            onOpen={() => router.push({ pathname: '/receta/[id]', params: { id: item.recipeId } })}
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
