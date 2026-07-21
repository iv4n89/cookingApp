import { Text, View } from 'react-native';

import { normalize } from '@/lib/ingredients';
import type { PrefGroup } from '@/lib/preferences';

import { PreferenceSection } from './preference-section';

// A top-level preferences group (e.g. food / special needs), filtering its sections by the
// search query. Renders nothing when nothing matches.
export function PreferenceGroup({
  group,
  query,
  selected,
  onToggle,
}: {
  group: PrefGroup;
  query: string;
  selected: Set<string>;
  onToggle: (label: string) => void;
}) {
  const q = normalize(query);
  const sections = group.sections
    .map((s) => ({ ...s, options: q ? s.options.filter((o) => normalize(o).includes(q)) : s.options }))
    .filter((s) => s.options.length > 0);
  if (sections.length === 0) return null;
  return (
    <View className="gap-stack-lg">
      <View className="gap-stack-sm">
        <Text className="font-sans-bold text-headline-sm text-on-surface">{group.title}</Text>
        <Text className="font-sans text-body-md text-on-surface-variant">{group.subtitle}</Text>
      </View>
      {sections.map((s) => (
        <PreferenceSection key={s.title} title={s.title} options={s.options} selected={selected} onToggle={onToggle} />
      ))}
    </View>
  );
}
