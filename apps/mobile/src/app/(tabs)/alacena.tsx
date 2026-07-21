import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { ErrorBanner } from '@/components/error-banner';
import { IngredientPicker } from '@/components/ingredient-picker';
import { usePantry, type PantryItem } from '@/lib/pantry';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

const UNCATEGORIZED = 'Otros';

function isLowStock(item: PantryItem) {
  return item.quantity !== null && item.min_stock !== null && item.quantity < item.min_stock;
}

function detailLine(item: PantryItem) {
  const parts = [item.quantity, item.unit].filter((value) => value !== null && value !== '');
  return parts.length ? parts.join(' ') : '—';
}

function Stepper({ item, onChange }: { item: PantryItem; onChange: (next: number) => void }) {
  const value = item.quantity ?? 0;
  return (
    <View className="flex-row items-center gap-stack-md">
      <Pressable
        onPress={() => onChange(Math.max(0, value - 1))}
        className="h-8 w-8 items-center justify-center rounded-full border border-outline-variant">
        <MaterialIcons name="remove" size={16} color={colors['on-surface']} />
      </Pressable>
      <Text
        numberOfLines={1}
        className="min-w-[3rem] px-stack-sm text-center font-mono-medium text-label-md text-on-surface">
        {value}
      </Text>
      <Pressable
        onPress={() => onChange(value + 1)}
        className="h-8 w-8 items-center justify-center rounded-full border border-outline-variant">
        <MaterialIcons name="add" size={16} color={colors['on-surface']} />
      </Pressable>
    </View>
  );
}

function ItemRow({
  item,
  onChangeQuantity,
  onEditMin,
  onRemove,
}: {
  item: PantryItem;
  onChangeQuantity: (next: number) => void;
  onEditMin: () => void;
  onRemove: () => void;
}) {
  return (
    <View className="gap-stack-md border border-card-border bg-card p-gutter">
      <View className="flex-row items-start justify-between gap-stack-md">
        <Text className="flex-1 font-sans-semibold text-body-md text-primary">{item.name}</Text>
        <Text className="font-mono text-label-sm text-on-surface-variant">{detailLine(item)}</Text>
      </View>
      <View className="flex-row items-center justify-between">
        <Stepper item={item} onChange={onChangeQuantity} />
        <View className="flex-row items-center gap-stack-md">
          {isLowStock(item) ? (
            <View
              accessibilityRole="image"
              accessibilityLabel="Stock bajo"
              className="h-7 w-7 items-center justify-center rounded-full bg-error">
              <MaterialIcons name="shopping-cart" size={15} color={colors['on-error']} />
            </View>
          ) : null}
          <Pressable onPress={onEditMin} hitSlop={8} className="flex-row items-center gap-stack-sm">
            <MaterialIcons name="flag" size={16} color={colors.outline} />
            <Text className="font-mono text-label-sm text-on-surface-variant">
              {item.min_stock != null ? `mín ${item.min_stock}` : 'mín —'}
            </Text>
          </Pressable>
          <Pressable onPress={onRemove} hitSlop={8}>
            <MaterialIcons name="delete-outline" size={20} color={colors.outline} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function SegmentedFilter({
  active,
  onChange,
}: {
  active: 'all' | 'low';
  onChange: (value: 'all' | 'low') => void;
}) {
  const options: { value: 'all' | 'low'; label: string }[] = [
    { value: 'all', label: 'TODO' },
    { value: 'low', label: 'STOCK BAJO' },
  ];
  return (
    <View className="flex-row self-start rounded-lg bg-tertiary-fixed p-1">
      {options.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => onChange(option.value)}
          className={`rounded px-stack-lg py-stack-md ${active === option.value ? 'bg-primary' : ''}`}>
          <Text
            className={`font-mono-medium text-label-md ${
              active === option.value ? 'text-on-primary' : 'text-on-surface-variant'
            }`}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function groupByCategory(items: PantryItem[]) {
  const groups = new Map<string, PantryItem[]>();
  for (const item of items) {
    const key = item.category?.trim() || UNCATEGORIZED;
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export default function AlacenaScreen() {
  const { items, loading, error, refresh, add, setQuantity, setMinStock, remove } = usePantry();
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [query, setQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMin, setEditingMin] = useState<PantryItem | null>(null);
  const [minDraft, setMinDraft] = useState('');

  function openMinEditor(item: PantryItem) {
    setEditingMin(item);
    setMinDraft(item.min_stock != null ? String(item.min_stock) : '');
  }

  function saveMin() {
    if (!editingMin) return;
    const parsed = minDraft.trim() ? Number(minDraft.replace(',', '.')) : null;
    setMinStock(editingMin.id, parsed !== null && !Number.isNaN(parsed) ? parsed : null);
    setEditingMin(null);
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === 'low' && !isLowStock(item)) return false;
      if (needle && !item.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [items, filter, query]);

  const groups = useMemo(() => groupByCategory(visible), [visible]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-stack-lg">
          <View className="gap-stack-md">
            <Text className="font-sans-bold text-display-lg text-primary">Mi Despensa</Text>
            <Text className="font-sans text-body-lg text-on-surface-variant">
              Organiza tus ingredientes y controla el inventario con precisión.
            </Text>
          </View>

          <SegmentedFilter active={filter} onChange={setFilter} />

          <View className="flex-row items-center gap-stack-md border-b-2 border-outline-variant py-stack-md">
            <MaterialIcons name="search" size={22} color={colors.outline} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              className="flex-1 font-sans-semibold text-headline-sm text-on-surface"
              placeholder="Buscar ingredientes…"
              placeholderTextColor={colors['outline-variant']}
            />
          </View>

          {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

          {loading ? (
            <ActivityIndicator color={colors.primary} className="mt-section-gap" />
          ) : items.length === 0 ? (
            error ? null : (
              <View className="mt-section-gap items-center gap-stack-md">
                <MaterialIcons name="kitchen" size={40} color={colors['outline-variant']} />
                <Text className="text-center font-sans text-body-md text-on-surface-variant">
                  Tu despensa está vacía. Añade tu primer ingrediente con el botón +.
                </Text>
              </View>
            )
          ) : visible.length === 0 ? (
            <Text className="mt-section-gap text-center font-sans text-body-md text-on-surface-variant">
              Sin resultados.
            </Text>
          ) : (
            <View className="gap-stack-lg">
              {groups.map(([category, categoryItems]) => (
                <View key={category} className="gap-stack-md">
                  <View className="flex-row items-center justify-between border-b border-outline-variant pb-stack-md">
                    <Text className="font-sans-semibold text-headline-sm text-primary">{category}</Text>
                    <View className="rounded bg-surface-container px-stack-md py-stack-sm">
                      <Text className="font-mono text-label-sm text-on-surface-variant">
                        {categoryItems.length} ITEMS
                      </Text>
                    </View>
                  </View>
                  <View className="gap-stack-sm">
                    {categoryItems.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        onChangeQuantity={(next) => setQuantity(item.id, next)}
                        onEditMin={() => openMinEditor(item)}
                        onRemove={() => remove(item.id)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
          {/* Colchón inferior para que el botón + no tape la última card. */}
          <View className="h-20" />
        </ScrollView>

        <Pressable
          onPress={() => setModalVisible(true)}
          className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary">
          <MaterialIcons name="add" size={28} color={colors['on-primary']} />
        </Pressable>
      </View>

      <IngredientPicker
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onAdd={(item) =>
          add({
            ingredient_id: item.ingredientId,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            unit: item.unit,
            min_stock: item.minStock,
          })
        }
      />

      <Modal
        visible={editingMin !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingMin(null)}>
        <Pressable
          onPress={() => setEditingMin(null)}
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          className="flex-1 items-center justify-center px-container-padding">
          <Pressable className="w-full gap-stack-lg rounded-xl bg-background p-stack-lg">
            <Text className="font-sans-bold text-headline-sm text-primary">
              Mínimo de {editingMin?.name}
            </Text>
            <Text className="font-sans text-body-md text-on-surface-variant">
              Marcamos “STOCK BAJO” cuando la cantidad baje de este número. Déjalo vacío para no avisar.
            </Text>
            <TextInput
              value={minDraft}
              onChangeText={setMinDraft}
              keyboardType="numeric"
              autoFocus
              placeholder="Sin mínimo"
              placeholderTextColor={colors['outline-variant']}
              className="border-b-2 border-outline bg-transparent py-stack-md font-sans text-body-lg text-on-surface"
            />
            <View className="flex-row justify-end gap-gutter">
              <Pressable onPress={() => setEditingMin(null)} className="px-gutter py-stack-md">
                <Text className="font-mono-medium text-label-md text-on-surface-variant">CANCELAR</Text>
              </Pressable>
              <Pressable onPress={saveMin} className="rounded-lg bg-primary px-gutter py-stack-md">
                <Text className="font-mono-medium text-label-md text-on-primary">GUARDAR</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
