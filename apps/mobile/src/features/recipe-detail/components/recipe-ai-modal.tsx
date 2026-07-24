import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sendChat, type ChatMessage } from '@/lib/chat';
import type { Recipe } from '@/lib/recipes';

import { colors } from '@recetas/theme/tokens';

// Mini-chat over the recipe detail to request AI modifications. The history is seeded with an
// assistant turn carrying the current recipe (the backend builds its adaptation context from
// assistant messages with `recipe`). Every reply that returns a recipe is applied to the detail
// behind the blur right away; closing the modal keeps the last applied version.
export function RecipeAiModal({
  visible,
  recipe,
  onClose,
  onRecipeUpdate,
}: {
  visible: boolean;
  recipe: Recipe;
  onClose: () => void;
  onRecipeUpdate: (recipe: Recipe) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { role: 'assistant', content: `¿Qué quieres cambiar de «${recipe.title}»?`, recipe },
  ]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Closing while a request is in flight would let the reply mutate the detail behind the
  // user's back (even mid-cooking), so the modal stays open until the turn resolves.
  function close() {
    if (sending) return;
    onClose();
  }

  async function send() {
    const question = text.trim();
    if (!question || sending) return;
    const history: ChatMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(history);
    setText('');
    setSending(true);
    setFailed(false);
    try {
      const reply = await sendChat(history);
      setMessages([...history, { role: 'assistant', content: reply.message, recipe: reply.recipe }]);
      // A reply that carries a recipe closes the modal to reveal the updated detail.
      if (reply.recipe) {
        onRecipeUpdate(reply.recipe);
        setSending(false);
        onClose();
        return;
      }
    } catch {
      setFailed(true);
    }
    setSending(false);
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
                <Text className="font-sans-bold text-headline-sm text-primary">Modificar receta</Text>
                <Pressable
                  onPress={close}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar">
                  <MaterialIcons name="close" size={24} color={colors['on-surface-variant']} />
                </Pressable>
              </View>

              <ScrollView
                ref={scrollRef}
                className="max-h-96"
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
                <View className="gap-stack-lg">
                  {messages.map((message, i) => (
                    <MessageBubble key={i} message={message} />
                  ))}
                  {sending ? <PendingBubble /> : null}
                </View>
              </ScrollView>

              {failed ? (
                <Text className="font-sans text-body-md text-error">
                  No se pudo obtener respuesta. Inténtalo de nuevo.
                </Text>
              ) : null}

              <KeyboardStickyView>
                <View className="flex-row items-end gap-stack-md">
                  <TextInput
                    multiline
                    value={text}
                    onChangeText={setText}
                    placeholder="p. ej. no tengo nata, ¿la puedo sustituir?"
                    placeholderTextColor={colors['outline-variant']}
                    className="max-h-28 flex-1 rounded-lg border border-outline-variant px-stack-lg py-gutter font-sans text-body-lg text-on-surface"
                  />
                  <Pressable
                    onPress={send}
                    disabled={!text.trim() || sending}
                    accessibilityRole="button"
                    accessibilityLabel="Enviar petición"
                    className={`items-center justify-center rounded-lg bg-primary p-gutter ${
                      !text.trim() || sending ? 'opacity-50' : ''
                    }`}>
                    <MaterialIcons name="arrow-upward" size={22} color={colors['on-primary']} />
                  </Pressable>
                </View>
              </KeyboardStickyView>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </BlurView>
    </Modal>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user';
  return (
    <View className={mine ? 'items-end' : 'items-start'}>
      <View
        className={`max-w-[88%] px-stack-lg py-gutter ${
          mine
            ? 'rounded-xl rounded-tr-none border border-primary bg-primary'
            : 'rounded-xl rounded-tl-none border border-outline-variant bg-surface-container-low'
        }`}>
        <Text className={`font-sans text-body-lg ${mine ? 'text-on-primary' : 'text-on-surface'}`}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

function PendingBubble() {
  return (
    <View className="items-start">
      <View className="rounded-xl rounded-tl-none border border-outline-variant bg-surface-container-low px-stack-lg py-gutter">
        <ActivityIndicator color={colors.primary} />
      </View>
    </View>
  );
}
