import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@recetas/theme/tokens';

export function AskAiModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (question: string) => void | Promise<void>;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (loading) return;
    setText('');
    setError(null);
    onClose();
  }

  async function submit() {
    const question = text.trim();
    if (!question || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(question);
      setText('');
      onClose();
    } catch {
      setError('No se pudo obtener la receta. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
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
                <Pressable
                  onPress={close}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar">
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

              {error ? (
                <Text className="font-sans text-body-md text-error">{error}</Text>
              ) : null}

              <Pressable
                onPress={submit}
                disabled={!text.trim() || loading}
                accessibilityRole="button"
                accessibilityLabel="Enviar pregunta"
                className={`flex-row items-center justify-center gap-stack-md rounded-lg bg-primary py-gutter ${
                  !text.trim() || loading ? 'opacity-50' : ''
                }`}>
                {loading ? (
                  <>
                    <ActivityIndicator color={colors['on-primary']} />
                    <Text className="font-mono-medium text-label-md uppercase tracking-widest text-on-primary">
                      Cocinando tu receta…
                    </Text>
                  </>
                ) : (
                  <>
                    <Text className="font-mono-medium text-label-md uppercase tracking-widest text-on-primary">
                      Preguntar
                    </Text>
                    <MaterialIcons name="arrow-forward" size={18} color={colors['on-primary']} />
                  </>
                )}
              </Pressable>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </BlurView>
    </Modal>
  );
}
