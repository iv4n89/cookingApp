import { normalize } from './ingredients';
import type { CookPantryItem, PantryMatch } from './pantry';
import type { RecipeIngredient } from './recipes';

// Básicos que se asumen siempre disponibles: no se marcan como "falta", no se añaden
// a la compra y no se descuentan al cocinar.
const BASICS = ['sal', 'pimienta', 'agua', 'aceite'];

// Dos palabras casan si son la misma o una es plural de la otra (-s / -es): tolera
// "aguacate/aguacates" y "limón/limones" sin casar palabras no relacionadas ("sal"/"salmón").
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return long === `${short}s` || long === `${short}es`;
}

function words(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

export function isBasic(name: string): boolean {
  const w = words(name);
  return BASICS.some((b) => w.some((x) => sameWord(x, b)));
}

// Casan si el nombre más corto está contenido en el más largo (tolerando plurales). Simétrico
// porque la especificidad puede ir en cualquier dirección: despensa "Limón amarillo" vs receta
// "limón", o despensa "Ajo" vs receta "diente de ajo".
function nameMatches(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const [few, many] = a.length <= b.length ? [a, b] : [b, a];
  return few.every((f) => many.some((m) => sameWord(f, m)));
}

// Un ingrediente falta si no es un básico y no está en la despensa (por id o por nombre).
export function isMissing(ingredient: RecipeIngredient, pantry: PantryMatch): boolean {
  if (isBasic(ingredient.name)) return false;
  if (ingredient.ingredient_id && pantry.ids.has(ingredient.ingredient_id)) return false;
  const recipeWords = words(ingredient.name);
  for (const pantryName of pantry.names) {
    if (nameMatches(recipeWords, words(pantryName))) return false;
  }
  return true;
}

export interface CookDelta {
  pantry_item_id: string;
  quantity: number;
}

// Qué descontar de la despensa al cocinar. Casa cada ingrediente con los items de despensa
// (por id o por nombre) y reparte la cantidad necesaria, agotando primero los de menor stock
// (el usuario puede tener duplicados). Los básicos no se descuentan. El descuento real lo
// recalcula la RPC contra el stock vivo, así que basta con proponer los items y cantidades.
export function computeCookDeltas(
  ingredients: RecipeIngredient[],
  pantryItems: CookPantryItem[],
): CookDelta[] {
  const deltas: CookDelta[] = [];
  for (const ing of ingredients) {
    if (ing.quantity == null || ing.quantity <= 0 || isBasic(ing.name)) continue;
    const recipeWords = words(ing.name);
    const matches = pantryItems
      .filter(
        (p) =>
          (p.quantity ?? 0) > 0 &&
          ((ing.ingredient_id != null && p.ingredient_id === ing.ingredient_id) ||
            nameMatches(recipeWords, words(p.name))),
      )
      .sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0));
    let need = ing.quantity;
    for (const p of matches) {
      if (need <= 0) break;
      const sub = Math.min(p.quantity ?? 0, need);
      deltas.push({ pantry_item_id: p.id, quantity: sub });
      need -= sub;
    }
  }
  return deltas;
}
