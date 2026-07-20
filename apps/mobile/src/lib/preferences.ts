import { supabase } from './supabase';

export interface PrefSection {
  title: string;
  options: string[];
}

export interface PrefGroup {
  key: 'food' | 'needs';
  title: string;
  subtitle: string;
  sections: PrefSection[];
}

// Catálogo curado. Se guarda la etiqueta seleccionada tal cual (alimenta el prompt de IA).
export const PREFERENCE_GROUPS: PrefGroup[] = [
  {
    key: 'food',
    title: 'Preferencias de comida',
    subtitle: 'Qué te gusta y cómo quieres comer',
    sections: [
      {
        title: 'Objetivo',
        options: [
          'Comer más sano',
          'Bajar de peso',
          'Más proteína',
          'Comidas rápidas (30 min)',
          'Cocina económica',
          'Aprovechar sobras',
          'Batch cooking',
        ],
      },
      { title: 'Sabores', options: ['Sin picante', 'Me gusta el picante', 'Baja en sal', 'Poco dulce'] },
      {
        title: 'Estilo',
        options: [
          'Más verdura',
          'Vegetariana',
          'Vegana',
          'Flexitariana',
          'Baja en carbohidratos',
          'Alta en proteína',
        ],
      },
      {
        title: 'Tipo de cocina',
        options: [
          'Mediterránea',
          'Casera tradicional',
          'Asiática',
          'Italiana',
          'Mexicana',
          'De temporada',
        ],
      },
    ],
  },
  {
    key: 'needs',
    title: 'Necesidades especiales',
    subtitle: 'Alergias, intolerancias y condiciones a respetar',
    sections: [
      {
        title: 'Alergias',
        options: [
          'Frutos secos',
          'Cacahuete',
          'Marisco',
          'Pescado',
          'Huevo',
          'Leche',
          'Soja',
          'Sésamo',
          'Mostaza',
          'Apio',
        ],
      },
      { title: 'Intolerancias', options: ['Lactosa', 'Gluten / celiaquía', 'Fructosa', 'Histamina', 'Sorbitol'] },
      {
        title: 'Condiciones de salud',
        options: [
          'Diabetes',
          'Hipertensión',
          'Colesterol alto',
          'Enfermedad renal',
          'Ostomía',
          'Disfagia (texturas)',
          'Reflujo / ERGE',
          'SII / colon irritable',
        ],
      },
      { title: 'Religiosas o éticas', options: ['Halal', 'Kosher', 'Sin cerdo', 'Sin alcohol'] },
    ],
  },
];

export interface UserPreferences {
  food_prefs: string[];
  special_needs: string[];
  notes: string;
}

export async function getPreferences(): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('food_prefs, special_needs, notes')
    .maybeSingle();
  if (error) throw error;
  return {
    food_prefs: data?.food_prefs ?? [],
    special_needs: data?.special_needs ?? [],
    notes: data?.notes ?? '',
  };
}

export async function savePreferences(userId: string, prefs: UserPreferences) {
  const { error } = await supabase.from('user_preferences').upsert(
    { user_id: userId, ...prefs, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}
