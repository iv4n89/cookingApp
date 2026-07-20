import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

export interface NewItemValues {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'numeric' | 'default';
}) {
  return (
    <View className="flex-1 gap-stack-sm">
      <Text className="font-mono uppercase tracking-wider text-label-sm text-on-surface-variant">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize="sentences"
        placeholderTextColor={colors['outline-variant']}
        className="border-b-2 border-outline bg-transparent py-stack-md font-sans text-body-lg text-on-surface"
      />
    </View>
  );
}

export function AddItemModal({
  visible,
  title,
  withCategory,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  withCategory?: boolean;
  onClose: () => void;
  onSubmit: (values: NewItemValues) => void;
}) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');

  function reset() {
    setName('');
    setQuantity('');
    setUnit('');
    setCategory('');
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsed = quantity.trim() ? Number(quantity.replace(',', '.')) : null;
    onSubmit({
      name: trimmed,
      quantity: parsed !== null && !Number.isNaN(parsed) ? parsed : null,
      unit: unit.trim() || null,
      category: withCategory ? category.trim() || null : null,
    });
    reset();
    onClose();
  }

  function cancel() {
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={cancel}>
      <Pressable onPress={cancel} className="flex-1 justify-end bg-inverse-surface/40">
        <Pressable className="gap-stack-lg rounded-t-xl bg-surface-container-lowest p-container-padding">
          <Text className="font-sans-bold text-headline-sm text-primary">{title}</Text>

          <Field label="Nombre" value={name} onChangeText={setName} />
          <View className="flex-row gap-gutter">
            <Field label="Cantidad" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
            <Field label="Unidad" value={unit} onChangeText={setUnit} />
          </View>
          {withCategory ? (
            <Field label="Categoría" value={category} onChangeText={setCategory} />
          ) : null}

          <View className="mt-stack-md flex-row gap-gutter">
            <Pressable
              onPress={cancel}
              className="flex-1 items-center rounded-lg border border-outline-variant py-stack-md">
              <Text className="font-mono-medium text-label-md text-on-surface-variant">Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!name.trim()}
              className={`flex-1 items-center rounded-lg bg-primary py-stack-md ${
                !name.trim() ? 'opacity-50' : ''
              }`}>
              <Text className="font-mono-medium text-label-md text-on-primary">Añadir</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
