import { Text, View } from 'react-native';

import { AddMissingButton } from '@/components/add-missing-button';
import type { CanonicalMap } from '@/lib/ingredients';
import type { CookPantryItem } from '@/lib/pantry';
import { isBasic, isMissingByStock } from '@/lib/pantry-match';
import { formatQuantity, type RecipeIngredient } from '@/lib/recipes';

function quantityLine(ingredient: RecipeIngredient): string {
  return [formatQuantity(ingredient.quantity), ingredient.unit].filter((v) => v !== '' && v !== null).join(' ');
}

// Ingredient list marking what's missing from the pantry, with a shortcut to add it to the
// shopping list. Before the pantry loads, everything non-basic is treated as missing.
export function IngredientList({
  ingredients,
  pantry,
  canonMap,
}: {
  ingredients: RecipeIngredient[];
  pantry: CookPantryItem[] | null;
  canonMap: CanonicalMap;
}) {
  const missing = pantry
    ? ingredients.filter((i) => isMissingByStock(i, pantry, canonMap))
    : ingredients.filter((i) => !isBasic(i.name));

  return (
    <View>
      <View className="mb-stack-md flex-row items-center justify-between">
        <Text className="font-sans-semibold text-headline-sm uppercase tracking-wider text-primary">
          Ingredientes
        </Text>
        <Text className="font-mono text-label-sm text-on-surface-variant">{ingredients.length} ITEMS</Text>
      </View>
      <View className="mb-stack-lg gap-stack-md">
        {ingredients.map((ingredient, i) => {
          const falta = pantry ? isMissingByStock(ingredient, pantry, canonMap) : false;
          return (
            <View
              key={`${ingredient.name}-${i}`}
              className="flex-row items-center justify-between border border-outline-variant bg-surface p-stack-md">
              <View className="flex-1 flex-row items-center gap-stack-md">
                <View className={`h-2 w-2 rounded-full ${falta ? 'bg-secondary' : 'bg-primary'}`} />
                <Text className="flex-1 font-sans text-body-md text-on-surface">{ingredient.name}</Text>
                {falta ? (
                  <Text className="font-mono text-label-sm uppercase text-secondary">Falta</Text>
                ) : null}
              </View>
              <Text className="font-mono text-label-sm text-on-surface-variant">{quantityLine(ingredient)}</Text>
            </View>
          );
        })}
      </View>
      <AddMissingButton missing={missing} />
    </View>
  );
}
