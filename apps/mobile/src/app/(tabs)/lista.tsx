import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddItemModal } from '@/components/add-item-modal';
import { AppHeader } from '@/components/app-header';
import { Checkbox } from '@/components/checkbox';
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
}: {
  item: ShoppingItem;
  onToggle: (checked: boolean) => void;
}) {
  const detail = detailLine(item);
  return (
    <View className="flex-row items-center gap-gutter rounded-lg border border-outline-variant bg-surface-container-low p-gutter">
      <Checkbox checked={item.checked} onToggle={() => onToggle(!item.checked)} />
      <View className="flex-1">
        <Text
          className={`font-sans-medium text-body-md ${
            item.checked ? 'text-on-surface-variant line-through' : 'text-on-surface'
          }`}>
          {item.name}
        </Text>
        {detail ? (
          <Text className="font-mono text-label-sm text-on-surface-variant">{detail}</Text>
        ) : null}
      </View>
    </View>
  );
}

export default function ListaScreen() {
  const { items, loading, add, toggle, removeChecked } = useShoppingList();
  const [modalVisible, setModalVisible] = useState(false);

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

        {loading ? (
          <ActivityIndicator color={colors.primary} className="mt-section-gap" />
        ) : items.length === 0 ? (
          <View className="mt-section-gap items-center gap-stack-md">
            <MaterialIcons name="shopping-basket" size={40} color={colors['outline-variant']} />
            <Text className="text-center font-sans text-body-md text-on-surface-variant">
              Tu lista está vacía. Añade lo que necesites comprar.
            </Text>
          </View>
        ) : (
          <View className="gap-base">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} onToggle={(checked) => toggle(item.id, checked)} />
            ))}
          </View>
        )}

        {checkedCount > 0 ? (
          <View className="gap-stack-md rounded-xl bg-primary-container p-stack-lg">
            <View className="flex-row items-start gap-gutter">
              <MaterialIcons name="info" size={22} color={colors['on-primary']} />
              <Text className="flex-1 font-sans text-body-md text-on-primary opacity-90">
                Marca lo comprado para quitarlo de la lista. Más adelante se añadirá a tu alacena
                automáticamente.
              </Text>
            </View>
            <Pressable
              onPress={removeChecked}
              className="items-center rounded-lg bg-surface-container-lowest py-stack-md">
              <Text className="font-mono-medium text-label-md text-primary">
                MARCAR COMO COMPRADO ({checkedCount})
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <AddItemModal
        visible={modalVisible}
        title="Añadir a la compra"
        onClose={() => setModalVisible(false)}
        onSubmit={({ name, quantity, unit }) => add({ name, quantity, unit })}
      />
    </SafeAreaView>
  );
}
