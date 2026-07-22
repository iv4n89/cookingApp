import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { formatDate } from '@/features/history/format-date';
import type { CookedEntry } from '@/lib/cooking';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

// A cooked-history row: tap to open its detail, or delete (uncook) with the close button.
export function CookedEntryRow({
  entry,
  busy,
  onOpen,
  onRemove,
}: {
  entry: CookedEntry;
  busy: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low p-gutter">
      <Pressable onPress={onOpen} accessibilityRole="button" className="flex-1 pr-gutter">
        <Text className="font-sans-semibold text-body-md text-on-surface">{entry.title}</Text>
        <Text className="font-mono text-label-sm text-on-surface-variant">
          {entry.servings} raciones · {formatDate(entry.cooked_at)}
        </Text>
      </Pressable>
      <Pressable
        onPress={onRemove}
        disabled={busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Borrar del historial"
        className="h-9 w-9 items-center justify-center">
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <MaterialIcons name="close" size={22} color={colors['on-surface-variant']} />
        )}
      </Pressable>
    </View>
  );
}
