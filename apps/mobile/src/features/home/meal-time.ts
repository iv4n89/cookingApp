import type { MealType } from '@/lib/recipes';

// Franja del día según la hora local (desayuno/almuerzo/merienda/cena).
export function currentMealType(date: Date): MealType {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'desayuno';
  if (h >= 12 && h < 17) return 'almuerzo';
  if (h >= 17 && h < 20) return 'merienda';
  return 'cena';
}

// Saludo por franja: mañana / tarde (incluye merienda) / noche.
export function greeting(date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

// Etiqueta para el título de sección ("Ideas para tu {label}").
export function mealLabel(meal: MealType): string {
  return meal;
}
