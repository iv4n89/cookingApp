import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Checkbox } from '@/components/checkbox';
import { ErrorBanner } from '@/components/error-banner';
import { IngredientPicker } from '@/components/ingredient-picker';
import { useShoppingList, type ShoppingItem } from '@/lib/shopping';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

function detailLine(item: ShoppingItem) {
  const parts = [item.quantity, item.unit].filter((value) => value !== null && value !== '');
  return parts.length ? parts.join(' ') : null;
}

function ItemRow({
  item,
  onToggle,
  onEditQty,
}: {
  item: ShoppingItem;
  onToggle: (checked: boolean) => void;
  onEditQty: () => void;
}) {
  const detail = detailLine(item);
  return (
    <Pressable
      onPress={() => onToggle(!item.checked)}
      className="flex-row items-center gap-gutter rounded-lg border border-outline-variant bg-surface-container-low p-gutter">
      <Checkbox checked={item.checked} onToggle={() => onToggle(!item.checked)} />
      <Text
        className={`flex-1 font-sans-medium text-body-md ${
          item.checked ? 'text-on-surface-variant line-through' : 'text-on-surface'
        }`}>
        {item.name}
      </Text>
      <Pressable
        onPress={onEditQty}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Editar cantidad"
        className="flex-row items-center gap-stack-sm border border-outline-variant px-stack-md py-stack-sm">
        <Text className="font-mono text-label-sm text-on-surface">{detail ?? 'Cantidad'}</Text>
        <MaterialIcons name="edit" size={14} color={colors.outline} />
      </Pressable>
    </Pressable>
  );
}

export default function ListaScreen() {
  const { items, loading, error, refresh, add, toggle, setQuantity, buyChecked } = useShoppingList();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingQty, setEditingQty] = useState<ShoppingItem | null>(null);
  const [qtyDraft, setQtyDraft] = useState('');

  function openQtyEditor(item: ShoppingItem) {
    setEditingQty(item);
    setQtyDraft(item.quantity != null ? String(item.quantity) : '');
  }

  function saveQty() {
    if (!editingQty) return;
    const parsed = qtyDraft.trim() ? Number(qtyDraft.replace(',', '.')) : null;
    setQuantity(editingQty.id, parsed !== null && !Number.isNaN(parsed) ? parsed : null);
    setEditingQty(null);
  }

  const checkedCount = items.filter((item) => item.checked).length;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppHeader />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-container-padding pt-stack-lg pb-section-gap gap-section-gap">
        <View className="gap-gutter">
          <View className="gap-stack-sm">
            <Text className="font-sans-bold text-display-lg text-primary">Lista de la compra</Text>
            <Text className="font-sans text-body-md text-on-surface-variant">
              Reúne tus ingredientes de la semana.
            </Text>
          </View>
          <Pressable
            onPress={() => setModalVisible(true)}
            className="flex-row items-center gap-stack-sm self-start rounded-lg bg-primary px-gutter py-stack-md">
            <MaterialIcons name="add" size={16} color={colors['on-primary']} />
            <Text className="font-mono-medium text-label-md text-on-primary">AÑADIR MANUALMENTE</Text>
          </Pressable>
        </View>

        {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} className="mt-section-gap" />
        ) : items.length === 0 ? (
          error ? null : (
            <View className="mt-section-gap items-center gap-stack-md">
              <MaterialIcons name="shopping-basket" size={40} color={colors['outline-variant']} />
              <Text className="text-center font-sans text-body-md text-on-surface-variant">
                Tu lista está vacía. Añade lo que necesites comprar.
              </Text>
            </View>
          )
        ) : (
          <View className="gap-base">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onToggle={(checked) => toggle(item.id, checked)}
                onEditQty={() => openQtyEditor(item)}
              />
            ))}
          </View>
        )}

        {checkedCount > 0 ? (
          <View className="gap-stack-md rounded-xl bg-primary-container p-stack-lg">
            <View className="flex-row items-start gap-gutter">
              <MaterialIcons name="info" size={22} color={colors['on-primary']} />
              <Text className="flex-1 font-sans text-body-md text-on-primary opacity-90">
                Al marcar como comprado se mueven a tu despensa, sumándose a lo que ya tengas.
              </Text>
            </View>
            <Pressable
              onPress={buyChecked}
              className="items-center rounded-lg bg-surface-container-lowest py-stack-md">
              <Text className="font-mono-medium text-label-md text-primary">
                MARCAR COMO COMPRADO ({checkedCount})
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <IngredientPicker
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onAdd={(item) =>
          add({
            ingredient_id: item.ingredientId,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
          })
        }
      />

      <Modal
        visible={editingQty !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingQty(null)}>
        <Pressable
          onPress={() => setEditingQty(null)}
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          className="flex-1 items-center justify-center px-container-padding">
          <Pressable className="w-full gap-stack-lg rounded-xl bg-background p-stack-lg">
            <Text className="font-sans-bold text-headline-sm text-primary">
              Cantidad de {editingQty?.name}
            </Text>
            <Text className="font-sans text-body-md text-on-surface-variant">
              Lo que compres se sumará a tu despensa al marcarlo como comprado.
            </Text>
            <View className="flex-row items-center gap-stack-md">
              <TextInput
                value={qtyDraft}
                onChangeText={setQtyDraft}
                keyboardType="numeric"
                autoFocus
                placeholder="Cantidad"
                placeholderTextColor={colors['outline-variant']}
                className="flex-1 border-b-2 border-outline bg-transparent py-stack-md font-sans text-body-lg text-on-surface"
              />
              {editingQty?.unit ? (
                <Text className="font-mono text-label-md text-on-surface-variant">{editingQty.unit}</Text>
              ) : null}
            </View>
            <View className="flex-row justify-end gap-gutter">
              <Pressable onPress={() => setEditingQty(null)} className="px-gutter py-stack-md">
                <Text className="font-mono-medium text-label-md text-on-surface-variant">CANCELAR</Text>
              </Pressable>
              <Pressable onPress={saveQty} className="rounded-lg bg-primary px-gutter py-stack-md">
                <Text className="font-mono-medium text-label-md text-on-primary">GUARDAR</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
