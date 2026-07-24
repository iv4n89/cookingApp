import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { TodayShoppingItem } from '@recetas/shared';

import { colors } from '@recetas/theme/tokens';

export function ShoppingMissingCard({
  items,
  adding,
  added,
  onAdd,
}: {
  items: TodayShoppingItem[];
  adding: boolean;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <View className="mx-container-padding gap-stack-md border border-outline-variant bg-surface-container-lowest p-stack-lg">
      {items.map((item, i) => (
        <View key={i} className="flex-row items-center justify-between">
          <Text className="font-sans text-body-lg text-on-surface">{item.name}</Text>
          {item.quantity != null ? (
            <Text className="font-mono text-label-md text-on-surface-variant">
              {item.quantity} {item.unit ?? ''}
            </Text>
          ) : null}
        </View>
      ))}
      <Pressable
        onPress={onAdd}
        disabled={adding || added}
        className={`flex-row items-center justify-center gap-stack-md bg-primary py-gutter ${adding || added ? 'opacity-60' : ''}`}>
        {adding ? (
          <ActivityIndicator color={colors['on-primary']} />
        ) : (
          <MaterialIcons name={added ? 'check' : 'add-shopping-cart'} size={18} color={colors['on-primary']} />
        )}
        <Text className="font-mono-medium text-label-md tracking-widest text-on-primary">
          {added ? 'AÑADIDO' : 'AÑADIR A LA COMPRA'}
        </Text>
      </Pressable>
    </View>
  );
}
