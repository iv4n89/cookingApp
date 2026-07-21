import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import type { PantryItem } from '@/lib/pantry';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Modal to edit an item's minimum stock (the threshold that flags it as low). Open while `item`
// is not null; leaving the field empty disables the low-stock warning.
export function MinStockModal({
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
          <Text className="font-sans-bold text-headline-sm text-primary">Mínimo de {item?.name}</Text>
          <Text className="font-sans text-body-md text-on-surface-variant">
            Marcamos “STOCK BAJO” cuando la cantidad baje de este número. Déjalo vacío para no avisar.
          </Text>
          <TextInput
            value={draft}
            onChangeText={onDraftChange}
            keyboardType="numeric"
            autoFocus
            placeholder="Sin mínimo"
            placeholderTextColor={colors['outline-variant']}
            className="border-b-2 border-outline bg-transparent py-stack-md font-sans text-body-lg text-on-surface"
          />
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
