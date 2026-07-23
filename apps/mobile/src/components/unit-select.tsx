import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { colors } from '@recetas/theme/tokens';

// Unidades controladas (líquidos en brick/botella, secos en g/paquete, especias en bote, etc.).
export const UNITS = [
  'g', 'kg', 'ml', 'l', 'ud', 'paquete', 'lata', 'bote', 'brick', 'botella',
  'diente', 'cabeza', 'ramillete', 'loncha', 'cucharada', 'pizca',
];

// Selector de unidad: dispara un desplegable inferior con la lista + "Sin unidad".
export function UnitSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (unit: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Elegir unidad"
        className="flex-row items-center justify-between border-b-2 border-outline py-stack-md">
        <Text className={`font-sans text-body-lg ${value ? 'text-on-surface' : 'text-outline-variant'}`}>
          {value || 'Elegir'}
        </Text>
        <MaterialIcons name="arrow-drop-down" size={24} color={colors.outline} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          className="flex-1 justify-end">
          <Pressable style={{ maxHeight: '60%' }} className="rounded-t-2xl bg-background pb-stack-lg pt-stack-md">
            <View className="mb-stack-sm flex-row items-center justify-between px-container-padding">
              <Text className="font-sans-bold text-headline-sm text-primary">Unidad</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel="Cerrar">
                <MaterialIcons name="close" size={24} color={colors['on-surface-variant']} />
              </Pressable>
            </View>
            <ScrollView>
              <Pressable
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="border-b border-outline-variant px-container-padding py-stack-md">
                <Text className="font-sans text-body-lg text-on-surface-variant">Sin unidad</Text>
              </Pressable>
              {UNITS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className="flex-row items-center justify-between border-b border-outline-variant px-container-padding py-stack-md">
                  <Text
                    className={`text-body-lg ${
                      value === option ? 'font-sans-semibold text-primary' : 'font-sans text-on-surface'
                    }`}>
                    {option}
                  </Text>
                  {value === option ? <MaterialIcons name="check" size={20} color={colors.primary} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
