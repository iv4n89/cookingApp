import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listCooked, uncookRecipe, type CookedEntry } from '@/lib/cooking';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function TopBar() {
  return (
    <View className="flex-row items-center gap-gutter border-b border-outline-variant bg-background px-container-padding py-stack-md">
      <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volver">
        <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text className="font-sans-bold text-headline-sm text-primary">Historial</Text>
    </View>
  );
}

export default function HistorialScreen() {
  const [entries, setEntries] = useState<CookedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    listCooked()
      .then((data) => {
        if (active) setEntries(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(load);

  async function remove(id: string) {
    if (busy) return;
    setBusy(id);
    try {
      await uncookRecipe(id);
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
    } catch {
      // se ignora; el usuario puede reintentar
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <TopBar />

      {loading ? (
        <ActivityIndicator color={colors.primary} className="mt-section-gap" />
      ) : entries.length === 0 ? (
        <View className="mt-section-gap items-center gap-stack-md px-container-padding">
          <MaterialIcons name="history" size={40} color={colors['outline-variant']} />
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            Aún no has cocinado ninguna receta.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-stack-md">
          <Text className="font-sans text-body-md text-on-surface-variant">
            Borrar una receta la quita del historial y devuelve sus ingredientes a la despensa.
          </Text>
          {entries.map((entry) => (
            <View
              key={entry.id}
              className="flex-row items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low p-gutter">
              <Pressable
                onPress={() => router.push({ pathname: '/historial/[id]', params: { id: entry.id } })}
                accessibilityRole="button"
                className="flex-1 pr-gutter">
                <Text className="font-sans-semibold text-body-md text-on-surface">{entry.title}</Text>
                <Text className="font-mono text-label-sm text-on-surface-variant">
                  {entry.servings} raciones · {formatDate(entry.cooked_at)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => remove(entry.id)}
                disabled={busy === entry.id}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Borrar del historial"
                className="h-9 w-9 items-center justify-center">
                {busy === entry.id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <MaterialIcons name="close" size={22} color={colors['on-surface-variant']} />
                )}
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
