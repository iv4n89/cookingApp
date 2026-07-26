import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { listIngredients, normalize, type CatalogIngredient } from '@/lib/ingredients';
import { getPantryMatch } from '@/lib/pantry';

import { colors } from '@recetas/theme/tokens';

function Thumb({ imageUrl }: { imageUrl: string | null }) {
  return (
    <View className="h-10 w-10 items-center justify-center overflow-hidden rounded bg-surface-container">
      {imageUrl ? (
        <Image source={imageUrl} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <MaterialIcons name="restaurant" size={18} color={colors['outline-variant']} />
      )}
    </View>
  );
}

// Selected ingredient, pinned above the list so it can be removed without hunting for it again.
function SelectedBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Pressable
      onPress={onRemove}
      className="flex-row items-center gap-stack-sm rounded-full bg-primary px-stack-md py-stack-sm">
      <Text className="font-mono-medium text-label-sm text-on-primary">{label}</Text>
      <MaterialIcons name="close" size={14} color={colors['on-primary']} />
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`border px-stack-md py-stack-sm ${
        active ? 'border-primary bg-tertiary-fixed' : 'border-outline-variant bg-background'
      }`}>
      <Text
        className={`font-mono-medium text-label-sm ${
          active ? 'text-on-tertiary-fixed' : 'text-on-surface-variant'
        }`}>
        {label}
      </Text>
    </Pressable>
  );
}

// Multi-selection over the ingredient catalog for the discoverer. Unlike the pantry picker, there
// are no quantities or units here: only which ingredients to discover recipes with.
export function IngredientMultiSelect({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [items, setItems] = useState<CatalogIngredient[]>([]);
  const [pantryIds, setPantryIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([listIngredients(), getPantryMatch().catch(() => [])])
      .then(([catalog, pantry]) => {
        if (!active) return;
        setItems(catalog);
        setPantryIds(
          new Set(pantry.map((entry) => entry.ingredient_id).filter((id): id is string => Boolean(id))),
        );
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const term = normalize(query);
  const visible = useMemo(
    () => (term ? items.filter((item) => normalize(item.name).includes(term)) : items),
    [items, term],
  );
  const fromPantry = useMemo(
    () => items.filter((item) => pantryIds.has(item.id)),
    [items, pantryIds],
  );
  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected],
  );

  if (loading) return <ActivityIndicator color={colors.primary} className="mt-section-gap" />;

  return (
    <View className="flex-1">
      {/* Search box and selected badges stay pinned: the catalog is long, and scrolling away from
          the selection made it hard to undo. */}
      <View className="gap-stack-md px-container-padding pt-stack-lg">
        <View className="flex-row items-center gap-stack-md rounded-xl border border-card-border bg-card px-stack-md">
          <MaterialIcons name="search" size={20} color={colors['on-surface-variant']} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar ingrediente"
            placeholderTextColor={colors['on-surface-variant']}
            className="flex-1 py-stack-md font-sans text-body-md text-on-surface"
          />
        </View>

        {selectedItems.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="gap-stack-sm">
            {selectedItems.map((item) => (
              <SelectedBadge key={item.id} label={item.name} onRemove={() => onToggle(item.id)} />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-container-padding pb-section-gap gap-stack-sm"
        ListHeaderComponent={
          fromPantry.length > 0 ? (
            <View className="gap-stack-sm py-stack-md">
              <Text className="font-mono-medium text-label-sm uppercase tracking-widest text-secondary">
                De tu despensa
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="gap-stack-sm">
                {fromPantry.map((item) => (
                  <Chip
                    key={item.id}
                    label={item.name}
                    active={selected.has(item.id)}
                    onPress={() => onToggle(item.id)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : (
            <View className="pt-stack-md" />
          )
        }
        renderItem={({ item }) => {
          const active = selected.has(item.id);
          return (
            <Pressable
              onPress={() => onToggle(item.id)}
              className={`flex-row items-center gap-stack-md rounded-xl border px-stack-md py-stack-md ${
                active ? 'border-primary bg-tertiary-fixed' : 'border-card-border bg-card'
              }`}>
              <Thumb imageUrl={item.image_url} />
              <Text className="flex-1 font-sans text-body-md text-on-surface">{item.name}</Text>
              <MaterialIcons
                name={active ? 'check-circle' : 'radio-button-unchecked'}
                size={22}
                color={active ? colors.primary : colors['outline-variant']}
              />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text className="text-center font-sans text-body-md text-on-surface-variant">
            Ningún ingrediente con ese nombre.
          </Text>
        }
      />
    </View>
  );
}
