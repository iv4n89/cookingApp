import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import type { PantrySummary } from '@/lib/pantry';

const { theme } = require('@recetas/theme/tailwind-preset');
const colors = theme.extend.colors;

function formatAmount(item: PantrySummary['low'][number]): string {
  return item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
}

// Pantry summary: item count and, when some run low, a "to restock" list with a shopping shortcut.
export function PantrySummaryCard({
  summary,
  onAddToShopping,
  adding,
  added,
}: {
  summary: PantrySummary;
  onAddToShopping: () => void;
  adding: boolean;
  added: boolean;
}) {
  return (
    <View className="gap-stack-md rounded-xl border border-card-border bg-card p-stack-lg">
      <View className="flex-row items-center gap-stack-md">
        <MaterialIcons name="kitchen" size={24} color={colors.primary} />
        <Text className="font-sans-semibold text-headline-sm text-on-surface">
          {summary.count} {summary.count === 1 ? 'ingrediente' : 'ingredientes'}
        </Text>
      </View>
      {summary.count === 0 ? (
        <Text className="font-sans text-body-md text-on-surface-variant">
          Aún no tienes nada en la despensa.
        </Text>
      ) : summary.low.length > 0 ? (
        <View className="gap-stack-md border-t border-outline-variant pt-stack-md">
          <Text className="font-mono uppercase tracking-wider text-label-sm text-on-surface-variant">
            Por reponer (bajo mínimo)
          </Text>
          {summary.low.map((item) => (
            <View key={item.id} className="flex-row items-center justify-between">
              <Text className="font-sans text-body-md text-on-surface">{item.name}</Text>
              <Text className="font-sans text-body-md text-on-surface-variant">{formatAmount(item)}</Text>
            </View>
          ))}
          <Pressable
            onPress={onAddToShopping}
            disabled={adding || added}
            className={`mt-stack-sm items-center border-[1.5px] border-primary py-stack-md ${
              adding || added ? 'opacity-60' : ''
            }`}>
            <Text className="font-mono-medium text-label-md text-primary">
              {added ? 'AÑADIDO A LA COMPRA' : adding ? 'AÑADIENDO…' : 'AÑADIR A LA COMPRA'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
