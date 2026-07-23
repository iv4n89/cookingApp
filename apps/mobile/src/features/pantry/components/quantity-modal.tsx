import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import type { PantryItem } from '@/lib/pantry';

import { colors } from '@recetas/theme/tokens';

// Modal to edit an item's exact quantity (allows decimals). The +/- stepper only nudges by whole
// units, which is useless for fractional units like litres; tapping the amount opens this.
export function QuantityModal({
  item,
  draft,
  onDraftChange,
  onCancel,
  onSave,
}: {
  item: PantryItem | null;
  draft: string;
  onDraftChange: (text: string) => void;
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
          <TextInput
            value={draft}
            onChangeText={onDraftChange}
            keyboardType="numeric"
            autoFocus
            placeholder="Sin cantidad"
            placeholderTextColor={colors['outline-variant']}
            className="border-b-2 border-outline bg-transparent py-stack-md font-sans text-body-lg text-on-surface"
          />
          {item?.unit ? (
            <Text className="font-mono text-label-sm text-on-surface-variant">Unidad: {item.unit}</Text>
          ) : null}
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
