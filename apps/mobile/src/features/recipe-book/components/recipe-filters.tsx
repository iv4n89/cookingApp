import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import type { MealType, RecipeListFilters } from '@/lib/recipes';

import { colors } from '@recetas/theme/tokens';

const MEALS: MealType[] = ['desayuno', 'almuerzo', 'merienda', 'cena'];
const DIETS: { value: 'vegetarian' | 'vegan'; label: string }[] = [
  { value: 'vegetarian', label: 'vegetariana' },
  { value: 'vegan', label: 'vegana' },
];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`border px-stack-md py-stack-sm ${
        active ? 'border-primary bg-tertiary-fixed' : 'border-outline-variant bg-background'
      }`}>
      <Text
        className={`font-mono-medium text-label-sm uppercase ${
          active ? 'text-on-tertiary-fixed' : 'text-on-surface-variant'
        }`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function RecipeFilters({
  filters,
  onChange,
}: {
  filters: RecipeListFilters;
  onChange: (filters: RecipeListFilters) => void;
}) {
  return (
    <View className="gap-stack-md">
      <View className="flex-row items-center gap-stack-md rounded-xl border border-card-border bg-card px-stack-md">
        <MaterialIcons name="search" size={20} color={colors['on-surface-variant']} />
        <TextInput
          value={filters.search ?? ''}
          onChangeText={(search) => onChange({ ...filters, search })}
          placeholder="Buscar receta"
          placeholderTextColor={colors['on-surface-variant']}
          className="flex-1 py-stack-md font-sans text-body-md text-on-surface"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-stack-sm">
        {MEALS.map((meal) => (
          <Chip
            key={meal}
            label={meal}
            active={filters.mealType === meal}
            onPress={() =>
              onChange({ ...filters, mealType: filters.mealType === meal ? null : meal })
            }
          />
        ))}
        {DIETS.map((diet) => (
          <Chip
            key={diet.value}
            label={diet.label}
            active={filters.diet === diet.value}
            onPress={() =>
              onChange({ ...filters, diet: filters.diet === diet.value ? null : diet.value })
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}
