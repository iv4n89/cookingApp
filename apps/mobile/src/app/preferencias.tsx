import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/lib/auth';
import { normalize } from '@/lib/ingredients';
import {
  getPreferences,
  savePreferences,
  PREFERENCE_GROUPS,
  type PrefGroup,
} from '@/lib/preferences';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

function TopBar() {
  return (
    <View className="flex-row items-center gap-gutter border-b border-outline-variant bg-background px-container-padding py-stack-md">
      <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volver">
        <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>
      <Text className="font-sans-bold text-headline-sm text-primary">Preferencias</Text>
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-stack-sm rounded-full border px-stack-md py-stack-sm ${
        selected ? 'border-primary bg-primary' : 'border-outline-variant bg-surface'
      }`}>
      {selected ? <MaterialIcons name="check" size={15} color={colors['on-primary']} /> : null}
      <Text className={`font-sans text-body-md ${selected ? 'text-on-primary' : 'text-on-surface'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: Set<string>;
  onToggle: (label: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const count = options.filter((o) => selected.has(o)).length;
  if (options.length === 0) return null;
  return (
    <View className="gap-stack-md">
      <Pressable onPress={() => setOpen((v) => !v)} className="flex-row items-center justify-between">
        <Text className="font-mono uppercase tracking-wider text-label-sm text-on-surface-variant">{title}</Text>
        <View className="flex-row items-center gap-stack-sm">
          {count > 0 ? (
            <Text className="font-mono-medium text-label-sm text-primary">{count}</Text>
          ) : null}
          <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color={colors.outline} />
        </View>
      </Pressable>
      {open ? (
        <View className="flex-row flex-wrap gap-stack-sm">
          {options.map((label) => (
            <Chip key={label} label={label} selected={selected.has(label)} onPress={() => onToggle(label)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Group({
  group,
  query,
  selected,
  onToggle,
}: {
  group: PrefGroup;
  query: string;
  selected: Set<string>;
  onToggle: (label: string) => void;
}) {
  const q = normalize(query);
  const sections = group.sections
    .map((s) => ({ ...s, options: q ? s.options.filter((o) => normalize(o).includes(q)) : s.options }))
    .filter((s) => s.options.length > 0);
  if (sections.length === 0) return null;
  return (
    <View className="gap-stack-lg">
      <View className="gap-stack-sm">
        <Text className="font-sans-bold text-headline-sm text-on-surface">{group.title}</Text>
        <Text className="font-sans text-body-md text-on-surface-variant">{group.subtitle}</Text>
      </View>
      {sections.map((s) => (
        <Section key={s.title} title={s.title} options={s.options} selected={selected} onToggle={onToggle} />
      ))}
    </View>
  );
}

export default function PreferenciasScreen() {
  const { session } = useSession();
  const [food, setFood] = useState<Set<string>>(new Set());
  const [needs, setNeeds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    getPreferences()
      .then((prefs) => {
        if (!active) return;
        setFood(new Set(prefs.food_prefs));
        setNeeds(new Set(prefs.special_needs));
        setNotes(prefs.notes);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const toggle = useCallback((setter: typeof setFood) => {
    return (label: string) => {
      setSaved(false);
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(label)) next.delete(label);
        else next.add(label);
        return next;
      });
    };
  }, []);

  const toggleFood = useMemo(() => toggle(setFood), [toggle]);
  const toggleNeeds = useMemo(() => toggle(setNeeds), [toggle]);

  async function save() {
    if (!session || saving) return;
    setSaving(true);
    try {
      await savePreferences(session.user.id, {
        food_prefs: [...food],
        special_needs: [...needs],
        notes: notes.trim(),
      });
      setSaved(true);
    } catch {
      // se ignora; el usuario puede reintentar
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <TopBar />

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
              <Group
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
                onChangeText={(t) => {
                  setSaved(false);
                  setNotes(t);
                }}
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
