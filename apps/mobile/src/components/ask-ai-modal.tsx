import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

export function AskAiModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (question: string) => void;
}) {
  const [text, setText] = useState('');

  function close() {
    setText('');
    onClose();
  }

  function submit() {
    const question = text.trim();
    if (!question) return;
    onSubmit(question);
    close();
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <BlurView intensity={28} tint="dark" style={{ flex: 1 }}>
        {/* Tocar fuera cierra. La hoja se ancla arriba para dejar sitio al teclado. */}
        <Pressable className="flex-1" onPress={close}>
          <SafeAreaView edges={['top']} className="px-container-padding">
            <Pressable
              onPress={() => {}}
              className="mt-stack-lg gap-stack-lg rounded-xl bg-surface-container-lowest p-container-padding">
              <View className="flex-row items-center justify-between">
                <Text className="font-sans-bold text-headline-sm text-primary">Pregunta a la IA</Text>
                <Pressable onPress={close} hitSlop={8} accessibilityLabel="Cerrar">
                  <MaterialIcons name="close" size={24} color={colors['on-surface-variant']} />
                </Pressable>
              </View>

              <TextInput
                autoFocus
                multiline
                value={text}
                onChangeText={setText}
                textAlignVertical="top"
                placeholder="Escribe tu pregunta… p. ej. ¿qué puedo cocinar con lo que tengo?"
                placeholderTextColor={colors['outline-variant']}
                className="min-h-[140px] font-sans text-body-lg text-on-surface"
              />

              <Pressable
                onPress={submit}
                disabled={!text.trim()}
                accessibilityRole="button"
                accessibilityLabel="Enviar pregunta"
                className={`flex-row items-center justify-center gap-stack-md rounded-lg bg-primary py-gutter ${
                  !text.trim() ? 'opacity-50' : ''
                }`}>
                <Text className="font-mono-medium text-label-md uppercase tracking-widest text-on-primary">
                  Preguntar
                </Text>
                <MaterialIcons name="arrow-forward" size={18} color={colors['on-primary']} />
              </Pressable>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </BlurView>
    </Modal>
  );
}
