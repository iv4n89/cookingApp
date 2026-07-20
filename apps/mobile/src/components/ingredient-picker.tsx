import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listIngredients, normalize, type CatalogIngredient } from '@/lib/ingredients';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

export interface PickedIngredient {
  ingredientId: string | null;
  name: string;
  category: string;
  quantity: number | null;
  unit: string | null;
}

interface Selected {
  id: string | null;
  name: string;
  category: string;
}

function IngredientRow({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between border-b border-outline-variant px-container-padding py-stack-md">
      <Text className="flex-1 pr-gutter font-sans text-body-md text-on-surface">{name}</Text>
      <MaterialIcons name="add-circle-outline" size={22} color={colors.primary} />
    </Pressable>
  );
}

export function IngredientPicker({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (item: PickedIngredient) => void;
}) {
  const [items, setItems] = useState<CatalogIngredient[]>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Selected | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');

  useEffect(() => {
    if (visible && items.length === 0) listIngredients().then(setItems).catch(() => {});
  }, [visible, items.length]);

  function back() {
    setSelected(null);
    setQuantity('');
    setUnit('');
  }

  function close() {
    setQuery('');
    setExpanded(new Set());
    back();
    onClose();
  }

  const q = normalize(query);
  const filtered = useMemo(
    () =>
      q
        ? items.filter((i) => normalize(i.name).includes(q) || normalize(i.category).includes(q))
        : items,
    [items, q],
  );
  const groups = useMemo(() => {
    const map = new Map<string, CatalogIngredient[]>();
    for (const i of filtered) {
      const bucket = map.get(i.category) ?? [];
      bucket.push(i);
      map.set(i.category, bucket);
    }
    return [...map.entries()];
  }, [filtered]);

  function toggle(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function confirm() {
    if (!selected) return;
    const parsed = quantity.trim() ? Number(quantity.replace(',', '.')) : null;
    onAdd({
      ingredientId: selected.id,
      name: selected.name,
      category: selected.category,
      quantity: parsed !== null && !Number.isNaN(parsed) ? parsed : null,
      unit: unit.trim() || null,
    });
    close();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        {selected ? (
          <View className="flex-1 gap-stack-lg px-container-padding pt-stack-lg">
            <View className="flex-row items-center gap-gutter">
              <Pressable onPress={back} hitSlop={8} accessibilityLabel="Volver">
                <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
              </Pressable>
              <Text className="font-sans-bold text-headline-sm text-primary">Cantidad</Text>
            </View>

            <View className="rounded-lg border border-card-border bg-card p-gutter">
              <Text className="font-sans-semibold text-headline-sm text-on-surface">{selected.name}</Text>
              <Text className="font-mono text-label-sm text-on-surface-variant">{selected.category}</Text>
            </View>

            <View className="flex-row gap-gutter">
              <View className="flex-1 gap-stack-sm">
                <Text className="font-mono uppercase tracking-wider text-label-sm text-on-surface-variant">
                  Cantidad
                </Text>
                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                  autoFocus
                  className="border-b-2 border-outline bg-transparent py-stack-md font-sans text-body-lg text-on-surface"
                />
              </View>
              <View className="flex-1 gap-stack-sm">
                <Text className="font-mono uppercase tracking-wider text-label-sm text-on-surface-variant">
                  Unidad
                </Text>
                <TextInput
                  value={unit}
                  onChangeText={setUnit}
                  placeholder="g, uds…"
                  placeholderTextColor={colors['outline-variant']}
                  className="border-b-2 border-outline bg-transparent py-stack-md font-sans text-body-lg text-on-surface"
                />
              </View>
            </View>

            <Pressable onPress={confirm} className="items-center rounded-lg bg-primary py-gutter">
              <Text className="font-mono-medium text-label-md text-on-primary">AÑADIR</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-1">
            <View className="flex-row items-center justify-between border-b border-outline-variant px-container-padding py-stack-md">
              <Text className="font-sans-bold text-headline-sm text-primary">Elegir ingrediente</Text>
              <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cerrar">
                <MaterialIcons name="close" size={24} color={colors['on-surface-variant']} />
              </Pressable>
            </View>

            <View className="flex-row items-center gap-stack-md border-b border-outline-variant px-container-padding py-stack-md">
              <MaterialIcons name="search" size={22} color={colors.outline} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                autoFocus
                placeholder="Buscar por nombre o categoría…"
                placeholderTextColor={colors['outline-variant']}
                className="flex-1 font-sans text-body-lg text-on-surface"
              />
            </View>

            <ScrollView className="flex-1" contentContainerClassName="pb-section-gap">
              {q ? (
                filtered.length === 0 ? (
                  <Pressable
                    onPress={() => setSelected({ id: null, name: query.trim(), category: 'Otros' })}
                    className="flex-row items-center gap-stack-md px-container-padding py-gutter">
                    <MaterialIcons name="add" size={20} color={colors.primary} />
                    <Text className="font-sans text-body-md text-primary">
                      Añadir “{query.trim()}” (personalizado)
                    </Text>
                  </Pressable>
                ) : (
                  filtered.map((i) => (
                    <IngredientRow key={i.id} name={i.name} onPress={() => setSelected(i)} />
                  ))
                )
              ) : (
                groups.map(([category, list]) => (
                  <View key={category}>
                    <Pressable
                      onPress={() => toggle(category)}
                      className="flex-row items-center justify-between border-b border-outline-variant bg-surface-container-low px-container-padding py-stack-md">
                      <Text className="font-sans-semibold text-body-lg text-primary">{category}</Text>
                      <View className="flex-row items-center gap-stack-md">
                        <Text className="font-mono text-label-sm text-on-surface-variant">{list.length}</Text>
                        <MaterialIcons
                          name={expanded.has(category) ? 'expand-less' : 'expand-more'}
                          size={22}
                          color={colors.outline}
                        />
                      </View>
                    </Pressable>
                    {expanded.has(category)
                      ? list.map((i) => (
                          <IngredientRow key={i.id} name={i.name} onPress={() => setSelected(i)} />
                        ))
                      : null}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
