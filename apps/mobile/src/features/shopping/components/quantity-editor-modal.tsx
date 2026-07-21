import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import { UnitSelect } from '@/components/unit-select';
import type { ShoppingItem } from '@/lib/shopping';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Modal to edit a shopping item's quantity and unit. Open while `item` is not null.
export function QuantityEditorModal({
  item,
  qtyDraft,
  onQtyChange,
  unitDraft,
  onUnitChange,
  onCancel,
  onSave,
}: {
  item: ShoppingItem | null;
  qtyDraft: string;
  onQtyChange: (text: string) => void;
  unitDraft: string | null;
  onUnitChange: (unit: string | null) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={item !== null} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        className="flex-1 items-center justify-center px-container-padding">
        <Pressable className="w-full gap-stack-lg rounded-xl bg-background p-stack-lg">
          <Text className="font-sans-bold text-headline-sm text-primary">Cantidad de {item?.name}</Text>
          <Text className="font-sans text-body-md text-on-surface-variant">
            Lo que compres se sumará a tu despensa al marcarlo como comprado.
          </Text>
          <View className="flex-row gap-gutter">
            <View className="flex-1 gap-stack-sm">
              <Text className="font-mono uppercase tracking-wider text-label-sm text-on-surface-variant">
                Cantidad
              </Text>
              <TextInput
                value={qtyDraft}
                onChangeText={onQtyChange}
                keyboardType="numeric"
                autoFocus
                placeholder="Cantidad"
                placeholderTextColor={colors['outline-variant']}
                className="border-b-2 border-outline bg-transparent py-stack-md font-sans text-body-lg text-on-surface"
              />
            </View>
            <View className="flex-1 gap-stack-sm">
              <Text className="font-mono uppercase tracking-wider text-label-sm text-on-surface-variant">
                Unidad
              </Text>
              <UnitSelect value={unitDraft} onChange={onUnitChange} />
            </View>
          </View>
          <View className="flex-row justify-end gap-gutter">
            <Pressable onPress={onCancel} className="px-gutter py-stack-md">
              <Text className="font-mono-medium text-label-md text-on-surface-variant">CANCELAR</Text>
            </Pressable>
            <Pressable onPress={onSave} className="rounded-lg bg-primary px-gutter py-stack-md">
              <Text className="font-mono-medium text-label-md text-on-primary">GUARDAR</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
