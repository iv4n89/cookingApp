import { Pressable, Text, View } from 'react-native';

// Selectable subscription plan card.
export function PlanOption({
  selected,
  onSelect,
  title,
  price,
  period,
  note,
  bestValue,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  price: string;
  period: string;
  note: string;
  bestValue?: boolean;
}) {
  return (
    <Pressable
      onPress={onSelect}
      className={`rounded-xl border-2 bg-surface-container-lowest p-stack-lg ${
        selected ? 'border-primary' : 'border-outline-variant'
      }`}>
      {bestValue ? (
        <View className="absolute -top-3 right-6 rounded-full bg-secondary px-stack-md py-stack-sm">
          <Text className="font-mono text-label-sm text-on-secondary">MEJOR VALOR</Text>
        </View>
      ) : null}
      <View className="mb-stack-sm flex-row items-center justify-between">
        <Text className="font-sans-semibold text-headline-sm text-on-surface">{title}</Text>
        <View
          className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
            selected ? 'border-primary bg-primary' : 'border-outline-variant'
          }`}>
          {selected ? <View className="h-2 w-2 rounded-full bg-on-primary" /> : null}
        </View>
      </View>
      <View className="flex-row items-baseline gap-stack-sm">
        <Text className="font-sans-bold text-display-lg text-primary">{price}</Text>
        <Text className="font-sans text-body-md text-on-surface-variant">{period}</Text>
      </View>
      <Text className="mt-stack-sm font-sans text-body-md italic text-on-surface-variant">{note}</Text>
    </Pressable>
  );
}
