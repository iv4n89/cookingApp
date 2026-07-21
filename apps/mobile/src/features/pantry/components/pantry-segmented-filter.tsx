import { Pressable, Text, View } from 'react-native';

// Two-way filter between all pantry items and only the ones running low.
export function PantrySegmentedFilter({
  active,
  onChange,
}: {
  active: 'all' | 'low';
  onChange: (value: 'all' | 'low') => void;
}) {
  const options: { value: 'all' | 'low'; label: string }[] = [
    { value: 'all', label: 'TODO' },
    { value: 'low', label: 'STOCK BAJO' },
  ];
  return (
    <View className="flex-row self-start rounded-lg bg-tertiary-fixed p-1">
      {options.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => onChange(option.value)}
          className={`rounded px-stack-lg py-stack-md ${active === option.value ? 'bg-primary' : ''}`}>
          <Text
            className={`font-mono-medium text-label-md ${
              active === option.value ? 'text-on-primary' : 'text-on-surface-variant'
            }`}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
