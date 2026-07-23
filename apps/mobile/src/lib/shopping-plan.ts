import { getCatalogDefaults, type CanonicalMap, type CatalogDefault } from './ingredients';
import { createIdempotencyKey } from './idempotency';
import { sameIngredient, normalizeUnit } from './pantry-match';
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

function findMatch(
  target: ShoppingTarget,
  shopping: ShoppingItem[],
  map: CanonicalMap,
): ShoppingItem | undefined {
  return shopping.find((item) =>
    sameIngredient(target.ingredient_id, target.name, item.ingredient_id, item.name, map),
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

export function buildPlan(
  targets: ShoppingTarget[],
  shopping: ShoppingItem[],
  map: CanonicalMap,
): ShoppingPlan {
  const toInsert: ShoppingTarget[] = [];
  const bumps = new Map<string, number>();
  for (const target of targets) {
    const match = findMatch(target, shopping, map);
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
export async function applyPlan(plan: ShoppingPlan): Promise<void> {
  if (plan.toInsert.length) {
    await Promise.all(plan.toInsert.map(async (target) => {
      const { error } = await supabase.rpc('add_shopping_item', {
        p_name: target.name,
        p_quantity: target.quantity,
        p_unit: target.unit,
        p_ingredient_id: target.ingredient_id,
        p_recipe_id: null,
        p_idempotency_key: createIdempotencyKey(),
      });
      if (error) throw error;
    }));
  }
  for (const bump of plan.toBump) {
    const { error } = await supabase.rpc('update_shopping_item', {
      p_item_id: bump.id,
      p_quantity: bump.quantity,
      p_unit: null,
    });
    if (error) throw error;
  }
}
