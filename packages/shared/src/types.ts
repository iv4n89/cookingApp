export type RecipeSource = "web" | "generated";

export interface Ingredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  substitutions: string[];
}

export interface RecipeStep {
  order: number;
  instruction: string;
  timerSeconds: number | null;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  source: RecipeSource;
  sourceUrl: string | null;
  imageUrl: string | null;
  servings: number;
  prepTimeMin: number;
  cookTimeMin: number;
  calories: number | null;
  tags: string[];
  ingredients: Ingredient[];
  steps: RecipeStep[];
  createdAt: string;
}

export interface PantryItem {
  id: string;
  userId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  updatedAt: string;
}

// El hogar es el propietario de la despensa y de la lista compartida. La migración de datos
// llegará en la Fase 1; estos contratos permiten que móvil y backend hablen ya el mismo idioma.
export type HouseholdRole = "owner" | "member";

export interface Household {
  id: string;
  name: string;
  createdAt: string;
}

export interface HouseholdMembership {
  householdId: string;
  userId: string;
  role: HouseholdRole;
  joinedAt: string;
}

export type InventoryEventType = "purchase" | "consume" | "adjustment" | "waste" | "restore";
export type InventoryEventSource = "shopping_list" | "recipe" | "manual" | "ticket" | "system";

export interface InventoryEvent {
  id: string;
  householdId: string;
  type: InventoryEventType;
  ingredientId: string | null;
  pantryBatchId: string | null;
  quantity: number;
  unit: string | null;
  source: InventoryEventSource;
  commandIdempotencyKey: string;
  occurredAt: string;
}

export interface CommandMetadata {
  idempotencyKey: string;
  occurredAt: string;
}

export interface CompleteShoppingCommand extends CommandMetadata {
  householdId: string;
  shoppingItemIds: string[];
}

export interface RegisterPurchaseItem {
  ingredientId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
}

export interface RegisterPurchaseCommand extends CommandMetadata {
  householdId: string;
  items: RegisterPurchaseItem[];
}

export interface AddShoppingItemCommand extends CommandMetadata {
  householdId: string;
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  recipeId: string | null;
}

export interface CookRecipeCommand extends CommandMetadata {
  householdId: string;
  recipeId: string;
  servings: number;
}

export interface AdjustInventoryCommand extends CommandMetadata {
  householdId: string;
  ingredientId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  reason: string;
}

export interface RestoreInventoryCommand extends CommandMetadata {
  householdId: string;
  inventoryEventId: string;
  reason: string;
}

export interface ShoppingListItem {
  id: string;
  userId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  recipeId: string | null;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export type SubscriptionTier = "free" | "premium";
export type SubscriptionPlan = "monthly" | "annual";

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  plan: SubscriptionPlan | null;
  renewsAt: string | null;
}

export type RecipeOrigin = "db" | "web" | "generated";

export interface SearchRecipesRequest {
  query: string;
  usePantryOnly: boolean;
  servings: number | null;
}

export interface SearchRecipesResponse {
  recipe: Recipe;
  origin: RecipeOrigin;
}
