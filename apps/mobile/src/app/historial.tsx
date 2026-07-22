import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { CookedEntryRow } from '@/features/history/components/cooked-entry-row';
import { useCookedHistory } from '@/features/history/hooks/use-cooked-history';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

export default function HistorialScreen() {
  const { entries, loading, busy, remove } = useCookedHistory();

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <BackHeader title="Historial" />

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
            <CookedEntryRow
              key={entry.id}
              entry={entry}
              busy={busy === entry.id}
              onOpen={() => router.push({ pathname: '/historial/[id]', params: { id: entry.id } })}
              onRemove={() => remove(entry.id)}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
