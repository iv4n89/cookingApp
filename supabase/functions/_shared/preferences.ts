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

// Necesidad especial (etiqueta del catálogo del perfil) -> alérgenos a excluir de la caché.
// Solo las de exclusión determinista; condiciones vagas (ostomía, diabetes, hipertensión...)
// no se pueden mapear a un "contiene X" y se atienden por guía de generación.
// Halal/Kosher: se excluyen sus violaciones inequívocas (cerdo/alcohol/marisco); no implica
// certificación completa, que va por la generación.
const NEED_TO_ALLERGENS: Record<string, string[]> = {
  'Frutos secos': ['nuts'],
  Cacahuete: ['peanut'],
  Marisco: ['crustaceans', 'molluscs'],
  Pescado: ['fish'],
  Huevo: ['egg'],
  Leche: ['milk'],
  Soja: ['soy'],
  Sésamo: ['sesame'],
  Mostaza: ['mustard'],
  Apio: ['celery'],
  Lactosa: ['milk'],
  'Gluten / celiaquía': ['gluten'],
  Fructosa: ['fructose'],
  Histamina: ['histamine'],
  Sorbitol: ['sorbitol'],
  'Sin cerdo': ['pork'],
  'Sin alcohol': ['alcohol'],
  Halal: ['pork', 'alcohol'],
  Kosher: ['pork', 'crustaceans', 'molluscs'],
};

// Preferencia dietética -> dieta que la receta debe cumplir.
const PREF_TO_DIET: Record<string, string[]> = {
  Vegana: ['vegan', 'vegetarian'],
  Vegetariana: ['vegetarian'],
};

// Deja solo las claves reconocidas del vocabulario (defensa ante lo que devuelva la IA).
export function sanitizeKeys(values: string[] | undefined, allowed: string[]): string[] {
  const set = new Set(allowed);
  return [...new Set((values ?? []).map((v) => v.toLowerCase().trim()).filter((v) => set.has(v)))];
}

export function excludedAllergens(specialNeeds: string[]): string[] {
  return [...new Set(specialNeeds.flatMap((n) => NEED_TO_ALLERGENS[n] ?? []))];
}

export function requiredDiet(foodPrefs: string[]): string[] {
  return [...new Set(foodPrefs.flatMap((p) => PREF_TO_DIET[p] ?? []))];
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
