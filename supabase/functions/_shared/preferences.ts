import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Vocabulario controlado para etiquetar recetas y filtrar la caché por preferencias.
// allergens: lo que la receta CONTIENE. diet: lo que la receta ES (cumple).
// Aviso: el etiquetado de allergens lo hace la IA al generar; no es infalible. El filtro
// es tan bueno como esa clasificación (una omisión del modelo podría colar una receta).
export const ALLERGEN_KEYS = [
  'gluten',
  'crustaceans',
  'molluscs',
  'egg',
  'fish',
  'peanut',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'fructose',
  'histamine',
  'sorbitol',
  'pork',
  'alcohol',
];

export const DIET_KEYS = ['vegan', 'vegetarian'];

export const MEAL_TYPE_KEYS = ['desayuno', 'almuerzo', 'merienda', 'cena'];

// Deja solo las claves reconocidas del vocabulario (defensa ante lo que devuelva la IA).
export function sanitizeKeys(values: string[] | undefined, allowed: string[]): string[] {
  const set = new Set(allowed);
  return [...new Set((values ?? []).map((v) => v.toLowerCase().trim()).filter((v) => set.has(v)))];
}

// El mapa necesidad->alérgeno / preferencia->dieta vive en la BD (tablas need_allergen_map y
// pref_diet_map, fuente única compartida con recommended_recipes). Ver migración 0033.
// Solo mapean exclusiones deterministas; condiciones vagas (ostomía, diabetes...) se atienden
// por guía de generación, no por filtro.
export async function excludedAllergens(
  supabase: SupabaseClient,
  specialNeeds: string[],
): Promise<string[]> {
  if (!specialNeeds.length) return [];
  const { data } = await supabase
    .from('need_allergen_map')
    .select('allergen')
    .in('need', specialNeeds);
  return [...new Set((data ?? []).map((row) => row.allergen as string))];
}

export async function requiredDiet(
  supabase: SupabaseClient,
  foodPrefs: string[],
): Promise<string[]> {
  if (!foodPrefs.length) return [];
  const { data } = await supabase.from('pref_diet_map').select('diet').in('pref', foodPrefs);
  return [...new Set((data ?? []).map((row) => row.diet as string))];
}

// Categorías controladas del catálogo de ingredientes (el seed 0007). El resolver del
// pipeline solo puede asignar una de estas; nunca 'Otros'.
export const CATALOG_CATEGORIES = [
  'Aceites, vinagres y salsas',
  'Carnes',
  'Cereales, pan y pasta',
  'Condimentos y edulcorantes',
  'Conservas y otros',
  'Especias y hierbas',
  'Frutas',
  'Frutos secos y semillas',
  'Lácteos y huevos',
  'Legumbres',
  'Pescados y mariscos',
  'Verduras y hortalizas',
];
