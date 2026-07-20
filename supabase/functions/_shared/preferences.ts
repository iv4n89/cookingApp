// Vocabulario controlado para etiquetar recetas y filtrar la caché por preferencias.
// allergens: lo que la receta CONTIENE. diet: lo que la receta ES (cumple).
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
  'pork',
  'alcohol',
];

export const DIET_KEYS = ['vegan', 'vegetarian'];

// Necesidad especial (etiqueta del catálogo del perfil) -> alérgenos a excluir de la caché.
// Solo las de exclusión determinista; condiciones (ostomía, diabetes...) van por guía de generación.
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
  'Sin cerdo': ['pork'],
  'Sin alcohol': ['alcohol'],
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
