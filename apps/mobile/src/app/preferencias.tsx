import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/back-header';
import { PreferenceGroup } from '@/features/preferences/components/preference-group';
import { usePreferences } from '@/features/preferences/hooks/use-preferences';
import { PREFERENCE_GROUPS } from '@/lib/preferences';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

export default function PreferenciasScreen() {
  const { loading, saving, saved, query, setQuery, food, needs, notes, changeNotes, toggleFood, toggleNeeds, save } =
    usePreferences();

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <BackHeader title="Preferencias" />

      {loading ? (
        <ActivityIndicator color={colors.primary} className="mt-section-gap" />
      ) : (
        <View className="flex-1">
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-container-padding pt-stack-lg pb-40 gap-section-gap"
            keyboardShouldPersistTaps="handled">
            <View className="flex-row items-center gap-stack-md border-b border-outline-variant pb-stack-md">
              <MaterialIcons name="search" size={22} color={colors.outline} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar preferencia o necesidad…"
                placeholderTextColor={colors['outline-variant']}
                className="flex-1 font-sans text-body-lg text-on-surface"
              />
            </View>

            {PREFERENCE_GROUPS.map((group) => (
              <PreferenceGroup
                key={group.key}
                group={group}
                query={query}
                selected={group.key === 'food' ? food : needs}
                onToggle={group.key === 'food' ? toggleFood : toggleNeeds}
              />
            ))}

            <View className="flex-row items-start gap-stack-md rounded-lg border border-outline-variant bg-surface-container-low p-gutter">
              <MaterialIcons name="info-outline" size={18} color={colors['on-surface-variant']} />
              <Text className="flex-1 font-sans text-body-md text-on-surface-variant">
                Usamos esto para adaptar tus recetas, pero no sustituye el consejo de un profesional médico o dietético.
              </Text>
            </View>

            <View className="gap-stack-md">
              <Text className="font-sans-bold text-headline-sm text-on-surface">Comentarios</Text>
              <Text className="font-sans text-body-md text-on-surface-variant">
                Cualquier cosa más que debamos tener en cuenta al proponerte recetas.
              </Text>
              <TextInput
                value={notes}
                onChangeText={changeNotes}
                multiline
                placeholder="Ej.: no me gusta el cilantro, cocino para dos, poco tiempo entre semana…"
                placeholderTextColor={colors['outline-variant']}
                className="min-h-24 rounded-lg border border-outline-variant bg-surface p-gutter font-sans text-body-md text-on-surface"
                style={{ textAlignVertical: 'top' }}
              />
            </View>
          </ScrollView>

          <View className="absolute inset-x-0 bottom-0 border-t border-outline-variant bg-background px-container-padding py-stack-md">
            <Pressable
              onPress={save}
              disabled={saving}
              className={`flex-row items-center justify-center gap-stack-md rounded-lg bg-primary py-gutter ${
                saving ? 'opacity-60' : ''
              }`}>
              {saving ? (
                <ActivityIndicator color={colors['on-primary']} />
              ) : (
                <MaterialIcons name={saved ? 'check' : 'save'} size={18} color={colors['on-primary']} />
              )}
              <Text className="font-mono-medium uppercase tracking-widest text-label-md text-on-primary">
                {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
