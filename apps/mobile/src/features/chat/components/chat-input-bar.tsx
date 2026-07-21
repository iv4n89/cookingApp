import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, TextInput, View } from 'react-native';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// Message composer: growing multiline input plus the send button. Disabled while a reply is
// in flight or the input is empty.
export function ChatInputBar({
  value,
  onChangeText,
  sending,
  onSend,
}: {
  value: string;
  onChangeText: (text: string) => void;
  sending: boolean;
  onSend: () => void;
}) {
  const disabled = sending || !value.trim();
  return (
    <View className="flex-row items-end gap-stack-sm border-t border-outline-variant bg-background px-container-padding py-stack-md">
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={!sending}
        multiline
        placeholder="Pregunta sobre recetas o ingredientes…"
        placeholderTextColor={colors['on-surface-variant']}
        style={{ minHeight: 44, maxHeight: 120, textAlignVertical: 'top' }}
        className="flex-1 rounded-2xl border border-outline-variant bg-surface-container-lowest px-gutter py-stack-md font-sans text-body-md text-on-surface"
      />
      <Pressable
        onPress={onSend}
        disabled={disabled}
        className={`h-11 w-11 items-center justify-center rounded-full bg-primary ${disabled ? 'opacity-50' : ''}`}>
        <MaterialIcons name="send" size={20} color={colors['on-primary']} />
      </Pressable>
    </View>
  );
}
