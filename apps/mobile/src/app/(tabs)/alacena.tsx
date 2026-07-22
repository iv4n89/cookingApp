import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { ErrorBanner } from '@/components/error-banner';
import { IngredientPicker } from '@/components/ingredient-picker';
import { MinStockModal } from '@/features/pantry/components/min-stock-modal';
import { QuantityModal } from '@/features/pantry/components/quantity-modal';
import { PantryAddButton } from '@/features/pantry/components/pantry-add-button';
import { PantryList } from '@/features/pantry/components/pantry-list';
import { PantrySegmentedFilter } from '@/features/pantry/components/pantry-segmented-filter';
import { usePantryScreen } from '@/features/pantry/hooks/use-pantry-screen';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

export default function AlacenaScreen() {
  const {
    items,
    loading,
    error,
    refresh,
    add,
    setQuantity,
    remove,
    filter,
    setFilter,
    query,
    setQuery,
    visible,
    groups,
    modalVisible,
    setModalVisible,
    editingMin,
    minDraft,
    setMinDraft,
    openMinEditor,
    saveMin,
    closeMinEditor,
    editingQty,
    qtyDraft,
    setQtyDraft,
    openQtyEditor,
    saveQty,
    closeQtyEditor,
  } = usePantryScreen();

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

          <PantrySegmentedFilter active={filter} onChange={setFilter} />

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
            <PantryList
              groups={groups}
              onSetQuantity={setQuantity}
              onEditQuantity={openQtyEditor}
              onEditMin={openMinEditor}
              onRemove={remove}
            />
          )}
          {/* Bottom spacer so the + button doesn't cover the last card. */}
          <View className="h-20" />
        </ScrollView>

        <PantryAddButton onPress={() => setModalVisible(true)} />
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

      <MinStockModal
        item={editingMin}
        draft={minDraft}
        onDraftChange={setMinDraft}
        onCancel={closeMinEditor}
        onSave={saveMin}
      />

      <QuantityModal
        item={editingQty}
        draft={qtyDraft}
        onDraftChange={setQtyDraft}
        onCancel={closeQtyEditor}
        onSave={saveQty}
      />
    </SafeAreaView>
  );
}
