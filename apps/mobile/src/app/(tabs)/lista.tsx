import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { ErrorBanner } from '@/components/error-banner';
import { IngredientPicker } from '@/components/ingredient-picker';
import { BuyCheckedBanner } from '@/features/shopping/components/buy-checked-banner';
import { QuantityEditorModal } from '@/features/shopping/components/quantity-editor-modal';
import { ShoppingItemRow } from '@/features/shopping/components/shopping-item-row';
import { useShoppingScreen } from '@/features/shopping/hooks/use-shopping-screen';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

export default function ListaScreen() {
  const {
    items,
    loading,
    error,
    refresh,
    add,
    toggle,
    buyChecked,
    checkedCount,
    modalVisible,
    setModalVisible,
    editingQty,
    qtyDraft,
    setQtyDraft,
    unitDraft,
    setUnitDraft,
    openQtyEditor,
    saveQty,
    closeQtyEditor,
  } = useShoppingScreen();

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
              <ShoppingItemRow
                key={item.id}
                item={item}
                onToggle={(checked) => toggle(item.id, checked)}
                onEditQty={() => openQtyEditor(item)}
              />
            ))}
          </View>
        )}

        {checkedCount > 0 ? <BuyCheckedBanner count={checkedCount} onBuy={buyChecked} /> : null}
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

      <QuantityEditorModal
        item={editingQty}
        qtyDraft={qtyDraft}
        onQtyChange={setQtyDraft}
        unitDraft={unitDraft}
        onUnitChange={setUnitDraft}
        onCancel={closeQtyEditor}
        onSave={saveQty}
      />
    </SafeAreaView>
  );
}
