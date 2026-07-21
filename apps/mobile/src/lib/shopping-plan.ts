import { getCatalogDefaults, type CatalogDefault } from './ingredients';
import { namesMatch, normalizeUnit } from './pantry-match';
import type { RecipeIngredient } from './recipes';
import { getShoppingItems, type ShoppingItem } from './shopping';
import { supabase } from './supabase';

export interface ShoppingTarget {
  name: string;
  ingredient_id: string | null;
  unit: string | null;
  quantity: number | null;
}

// Representación de compra de un ingrediente que falta: la unidad de compra del catálogo, y la
// cantidad = lo que pide la receta si la unidad es comparable, o la cantidad de compra por defecto
// (para envases donde la medida de la receta no se puede convertir, p.ej. cucharada -> botella).
function toTarget(ing: RecipeIngredient, def: CatalogDefault | undefined): ShoppingTarget {
  const unit = def?.unit ?? ing.unit;
  const comparable = ing.quantity != null && normalizeUnit(ing.unit) === normalizeUnit(unit);
  const quantity = comparable ? ing.quantity : (def?.min ?? ing.quantity);
  return { name: ing.name, ingredient_id: ing.ingredient_id ?? null, unit, quantity };
}

function findMatch(target: ShoppingTarget, shopping: ShoppingItem[]): ShoppingItem | undefined {
  return shopping.find(
    (item) =>
      (target.ingredient_id != null && item.ingredient_id === target.ingredient_id) ||
      namesMatch(item.name, target.name),
  );
}

// ¿El item de la lista cubre el target? Con la misma unidad, cantidad suficiente; si la unidad
// no es comparable, con estar presente basta.
function covers(item: ShoppingItem, target: ShoppingTarget): boolean {
  if (target.quantity == null) return true;
  if (normalizeUnit(item.unit) !== normalizeUnit(target.unit)) return true;
  return (item.quantity ?? 0) >= target.quantity;
}

export interface ShoppingPlan {
  toInsert: ShoppingTarget[]; // no están en la lista
  toBump: { id: string; quantity: number }[]; // están pero con cantidad insuficiente (misma unidad)
}

export function buildPlan(targets: ShoppingTarget[], shopping: ShoppingItem[]): ShoppingPlan {
  const toInsert: ShoppingTarget[] = [];
  // Por id, la mayor cantidad pedida (dos ingredientes pueden casar con la misma fila).
  const bumps = new Map<string, number>();
  for (const target of targets) {
    const match = findMatch(target, shopping);
    if (!match) {
      toInsert.push(target);
    } else if (!covers(match, target) && target.quantity != null) {
      bumps.set(match.id, Math.max(bumps.get(match.id) ?? 0, target.quantity));
    }
  }
  const toBump = [...bumps.entries()].map(([id, quantity]) => ({ id, quantity }));
  return { toInsert, toBump };
}

export function planPending(plan: ShoppingPlan): number {
  return plan.toInsert.length + plan.toBump.length;
}

// Carga la lista actual + los defaults del catálogo y calcula los targets de lo que falta.
export async function loadTargets(
  missing: RecipeIngredient[],
): Promise<{ targets: ShoppingTarget[]; shopping: ShoppingItem[] }> {
  const [shopping, defaults] = await Promise.all([
    getShoppingItems(),
    getCatalogDefaults(missing.map((m) => m.ingredient_id ?? '')),
  ]);
  const targets = missing.map((ing) =>
    toTarget(ing, ing.ingredient_id ? defaults.get(ing.ingredient_id) : undefined),
  );
  return { targets, shopping };
}

// Inserta lo que no está y sube las cantidades de lo que está corto.
export async function applyPlan(userId: string, plan: ShoppingPlan): Promise<void> {
  if (plan.toInsert.length) {
    const rows = plan.toInsert.map((t) => ({
      user_id: userId,
      name: t.name,
      quantity: t.quantity,
      unit: t.unit,
      ingredient_id: t.ingredient_id,
    }));
    const { error } = await supabase.from('shopping_list_items').insert(rows);
    if (error) throw error;
  }
  for (const bump of plan.toBump) {
    const { error } = await supabase
      .from('shopping_list_items')
      .update({ quantity: bump.quantity })
      .eq('id', bump.id);
    if (error) throw error;
  }
}
