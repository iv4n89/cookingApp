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

// Solo el ingrediente básico exacto: "sal", "pimienta", "agua", "aceite". Cualquier variante
// ("aceite de oliva", "sal gorda", "agua de coco") es un ingrediente normal a comprar.
export function isBasic(name: string): boolean {
  return BASICS.includes(normalize(name));
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

export function normalizeUnit(unit: string | null): string {
  return (unit ?? '').trim().toLowerCase().replace(/s$/, '');
}

// Factor de cada unidad a la base de su dimensión (volumen→ml, masa→g). Las unidades sin
// factor (ud, bote, lata, diente, pizca…) solo son comparables consigo mismas.
const UNIT_TO_BASE: Record<string, { dim: string; factor: number }> = {
  ml: { dim: 'vol', factor: 1 },
  l: { dim: 'vol', factor: 1000 },
  cucharada: { dim: 'vol', factor: 15 },
  cucharadita: { dim: 'vol', factor: 5 },
  g: { dim: 'mass', factor: 1 },
  kg: { dim: 'mass', factor: 1000 },
};

// Convierte una cantidad de una unidad a otra cuando son de la misma dimensión (o la misma
// unidad). Devuelve null si no son comparables: entonces no se puede saber cuánto descontar.
export function convertQuantity(quantity: number, from: string | null, to: string | null): number | null {
  const a = UNIT_TO_BASE[normalizeUnit(from)];
  const b = UNIT_TO_BASE[normalizeUnit(to)];
  if (a && b && a.dim === b.dim) return (quantity * a.factor) / b.factor;
  if (normalizeUnit(from) === normalizeUnit(to)) return quantity;
  return null;
}

// ¿Dos nombres de ingrediente se refieren al mismo? (match por palabras con tolerancia a plurales)
export function namesMatch(a: string, b: string): boolean {
  return nameMatches(words(a), words(b));
}

// Falta con conciencia de cantidad: no está en la despensa (por id/nombre), o está pero —con
// la misma unidad— la cantidad disponible no llega a la que pide la receta. Solo se juzga
// insuficiente cuando las unidades son comparables; si no, se asume que lo tienes. Los básicos
// nunca faltan.
export function isMissingByStock(ingredient: RecipeIngredient, pantry: CookPantryItem[]): boolean {
  if (isBasic(ingredient.name)) return false;
  const recipeWords = words(ingredient.name);
  const matches = pantry.filter(
    (p) =>
      (ingredient.ingredient_id != null && p.ingredient_id === ingredient.ingredient_id) ||
      nameMatches(recipeWords, words(p.name)),
  );
  if (matches.length === 0) return true;
  if (ingredient.quantity == null || ingredient.quantity <= 0) return false;
  const unit = normalizeUnit(ingredient.unit);
  const comparable = matches.filter((p) => p.quantity != null && normalizeUnit(p.unit) === unit);
  if (comparable.length === 0) return false;
  const available = comparable.reduce((sum, p) => sum + (p.quantity ?? 0), 0);
  return available < ingredient.quantity;
}

export interface CookDelta {
  pantry_item_id: string;
  quantity: number;
}

// Qué descontar de la despensa al cocinar. Casa cada ingrediente con los items de despensa
// (por id o por nombre) y reparte la cantidad necesaria, agotando primero los de menor stock
// (el usuario puede tener duplicados). La cantidad de la receta se convierte a la unidad de
// cada item; si las unidades no son comparables (p. ej. receta en cucharadas, despensa en
// litros para el mismo ingrediente) ese item no se descuenta. Los básicos no se descuentan.
// El descuento real lo recalcula la RPC contra el stock vivo (en la unidad del item).
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
    let need = ing.quantity; // en la unidad de la receta
    for (const p of matches) {
      if (need <= 0) break;
      const needInItemUnit = convertQuantity(need, ing.unit, p.unit);
      if (needInItemUnit == null) continue; // unidad no comparable: no se descuenta este item
      const sub = Math.min(p.quantity ?? 0, needInItemUnit);
      if (sub <= 0) continue;
      deltas.push({ pantry_item_id: p.id, quantity: sub });
      need -= convertQuantity(sub, p.unit, ing.unit) ?? 0;
    }
  }
  return deltas;
}
