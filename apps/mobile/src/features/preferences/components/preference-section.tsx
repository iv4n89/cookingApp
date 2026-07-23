import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PreferenceChip } from './preference-chip';

import { colors } from '@recetas/theme/tokens';

// Collapsible group of preference chips with a selected count.
export function PreferenceSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: Set<string>;
  onToggle: (label: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const count = options.filter((o) => selected.has(o)).length;
  if (options.length === 0) return null;
  return (
    <View className="gap-stack-md">
      <Pressable onPress={() => setOpen((v) => !v)} className="flex-row items-center justify-between">
        <Text className="font-mono uppercase tracking-wider text-label-sm text-on-surface-variant">{title}</Text>
        <View className="flex-row items-center gap-stack-sm">
          {count > 0 ? <Text className="font-mono-medium text-label-sm text-primary">{count}</Text> : null}
          <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color={colors.outline} />
        </View>
      </Pressable>
      {open ? (
        <View className="flex-row flex-wrap gap-stack-sm">
          {options.map((label) => (
            <PreferenceChip
              key={label}
              label={label}
              selected={selected.has(label)}
              onPress={() => onToggle(label)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
