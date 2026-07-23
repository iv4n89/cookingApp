import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AddMissingButton } from '@/components/add-missing-button';
import { ServingsStepper } from '@/components/servings-stepper';
import type { CanonicalMap } from '@/lib/ingredients';
import type { PantryMatch } from '@/lib/pantry';
import { isMissing } from '@/lib/pantry-match';
import { formatQuantity, scaleIngredients, type Recipe, type RecipeIngredient } from '@/lib/recipes';

import { colors } from '@recetas/theme/tokens';

function MetaChip({ icon, text }: { icon: 'schedule' | 'restaurant'; text: string }) {
  return (
    <View className="flex-row items-center gap-stack-sm">
      <MaterialIcons name={icon} size={16} color={colors['on-surface-variant']} />
      <Text className="font-mono-medium text-label-sm text-on-surface-variant">{text}</Text>
    </View>
  );
}

function ingredientText(ingredient: RecipeIngredient): string {
  return [formatQuantity(ingredient.quantity), ingredient.unit, ingredient.name]
    .filter((v) => v !== '' && v !== null)
    .join(' ');
}

// Recipe card rendered inside an assistant message: image, servings stepper, ingredient list
// marking what's missing (with a shortcut to the shopping list) and a link to cook it.
export function ChatRecipeCard({
  recipe,
  pantry,
  canonMap,
}: {
  recipe: Recipe;
  pantry: PantryMatch | null;
  canonMap: CanonicalMap;
}) {
  const [servings, setServings] = useState(recipe.servings > 0 ? recipe.servings : 1);

  const total = recipe.prep_time_min + recipe.cook_time_min;
  const scaled = scaleIngredients(recipe.ingredients, recipe.servings, servings);
  const missing = pantry ? scaled.filter((ing) => isMissing(ing, pantry, canonMap)) : [];

  return (
    <View className="w-full max-w-[92%] gap-gutter overflow-hidden rounded-xl rounded-tl-none border border-outline-variant bg-surface-container-low">
      {recipe.image_url ? (
        <View className="aspect-[3/2] w-full items-center justify-center bg-surface-container">
          <Image source={recipe.image_url} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        </View>
      ) : null}

      <View className={`gap-gutter p-stack-lg ${recipe.image_url ? 'pt-0' : ''}`}>
        <View className="self-start bg-primary px-stack-md py-stack-sm">
          <Text className="font-mono text-label-sm text-on-primary">RECETA</Text>
        </View>
        <Text className="font-sans-semibold text-headline-sm text-on-surface">{recipe.title}</Text>
        {recipe.description ? (
          <Text className="font-sans text-body-md text-on-surface-variant">{recipe.description}</Text>
        ) : null}
        {total > 0 ? (
          <View className="flex-row flex-wrap gap-gutter">
            <MetaChip icon="schedule" text={`${total} MIN`} />
          </View>
        ) : null}

        <ServingsStepper servings={servings} onChange={setServings} />

        <View className="gap-stack-md border-t border-outline-variant pt-gutter">
          <Text className="font-mono uppercase tracking-wider text-label-sm text-on-surface-variant">
            Ingredientes
          </Text>
          {scaled.map((ing, i) => {
            const falta = pantry ? isMissing(ing, pantry, canonMap) : false;
            return (
              <View key={i} className="flex-row items-start gap-stack-md">
                <View className={`mt-2 h-1.5 w-1.5 rounded-full ${falta ? 'bg-secondary' : 'bg-primary'}`} />
                <Text className="flex-1 font-sans text-body-md text-on-surface">{ingredientText(ing)}</Text>
                {falta ? (
                  <Text className="mt-0.5 font-mono text-label-sm uppercase text-secondary">Falta</Text>
                ) : null}
              </View>
            );
          })}
        </View>

        {missing.length > 0 ? <AddMissingButton missing={missing} /> : null}

        <Pressable
          onPress={() => router.push({ pathname: '/receta/[id]', params: { id: recipe.id, servings } })}
          className="flex-row items-center justify-center gap-stack-md bg-primary py-gutter">
          <MaterialIcons name="play-arrow" size={20} color={colors['on-primary']} />
          <Text className="font-mono-medium uppercase tracking-widest text-label-md text-on-primary">
            Comenzar a cocinar
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
