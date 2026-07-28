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

export type ExpirationStatus = "fresh" | "consume_soon" | "priority";
export type ExpirationConfidence = "high" | "medium" | "low";
export type ExpirationMatchType = "direct" | "family" | "fallback";
export type ExpirationReasonCode =
  | "within_estimated_window"
  | "approaching_estimated_window"
  | "inside_priority_window";

export interface ExpirationBatchSnapshot {
  batchId: string;
  pantryItemId: string;
  canonicalIngredientId: string;
  ingredientName: string;
  remainingQuantity: number;
  unit: string | null;
  acquiredAt: string;
  evaluatedAt: string;
  ageDays: number;
  status: ExpirationStatus;
  confidence: ExpirationConfidence;
  matchType: ExpirationMatchType;
  minDays: number;
  maxDays: number;
  reasonCode: ExpirationReasonCode;
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

export type RecommendationMode = "cook_now" | "shop_then_cook";

export type RecommendationReasonCode =
  | "ready_from_pantry"
  | "uses_priority_ingredients"
  | "uses_consume_soon_ingredients"
  | "seasonal_fit"
  | "meal_type_fit"
  | "requires_shopping"
  | "unknown_ingredient"
  | "unsupported_unit";

export interface RecommendationScoreBreakdown {
  priorityUsage: number;
  consumeSoonUsage: number;
  seasonalAffinity: number;
  mealTypeMatch: number;
  availabilityRatio: number;
  missingIngredientCount: number;
}

export type RecommendationMissingReason =
  | "missing"
  | "insufficient_quantity"
  | "unknown_ingredient"
  | "unsupported_unit";

export interface RecommendationMissingIngredient {
  ingredientId: string | null;
  name: string;
  requiredQuantity: number | null;
  unit: string | null;
  reason: RecommendationMissingReason;
}

export interface RecommendationCandidate {
  recipeId: string;
  mode: RecommendationMode;
  rank: number;
  score: RecommendationScoreBreakdown;
  reasonCodes: RecommendationReasonCode[];
  usedBatchIds: string[];
  missingIngredients: RecommendationMissingIngredient[];
}

export type RecommendationSeason = "spring" | "summer" | "autumn" | "winter";
export type RecommendationSeasonKey = RecommendationSeason | "all_year";
export type RecommendationMealType = "desayuno" | "almuerzo" | "merienda" | "cena";

export interface RecommendationInventoryBatchInput {
  batchId: string;
  canonicalIngredientId: string;
  remainingQuantity: number;
  unit: string | null;
  acquiredAt: string;
  expirationStatus: "fresh" | "consume_soon" | "priority" | null;
}

export interface RecommendationRecipeIngredientInput {
  ingredientId: string | null;
  canonicalIngredientId: string | null;
  /** Nombre normalizado del ingrediente canónico; nunca procede del texto de la receta. */
  canonicalName: string | null;
  name: string;
  requiredQuantity: number | null;
  unit: string | null;
  safetyAllergens: string[] | null;
  safetyIncompatibleDiets: string[] | null;
  safetyCompositionStatus: "exact_reviewed" | "variable_unknown" | null;
  safetyProfileVersion: string | null;
}

export interface RecommendationRecipeInput {
  recipeId: string;
  allergens: string[] | null;
  diet: string[] | null;
  mealTypes: RecommendationMealType[];
  seasons: RecommendationSeasonKey[];
  seasonConfidence: "high" | "medium" | "low" | null;
  seasonSource: "curated" | "generated" | "backfill" | null;
  seasonClassifierVersion: string | null;
  ingredients: RecommendationRecipeIngredientInput[];
}

export interface RecommendationSnapshot {
  householdId: string;
  requestingUserId: string;
  evaluatedAt: string;
  evaluationDate: string;
  season: RecommendationSeason;
  mealType: RecommendationMealType | null;
  policyVersion: string;
  assumedBasicsVersion: string;
  ingredientSafetyDatasetVersion: string;
  effectiveAllergens: string[];
  requiredDiet: string[];
  unsupportedHouseholdNeeds: string[];
  hasUnsupportedHouseholdNotes: boolean;
  inventoryBatches: RecommendationInventoryBatchInput[];
  recipeInputs: RecommendationRecipeInput[];
}

export interface RecommendationDecision {
  policyVersion: string;
  evaluatedAt: string;
  season: RecommendationSeason;
  mealType: RecommendationMealType | null;
  selectedRecipeId: string | null;
  candidates: RecommendationCandidate[];
  decisionReason:
    | "selected_cook_now"
    | "selected_shop_then_cook"
    | "no_safe_candidate"
    | "unsupported_household_restriction";
  snapshot: RecommendationSnapshot;
}

export type TodayPriorityStatus = "priority" | "consume_soon";

export interface TodayPriorityProduct {
  name: string;
  canonicalIngredientId: string;
  status: TodayPriorityStatus;
  estimatedDate: string | null;
  confidence: "high" | "medium" | "low";
}

export interface TodayRecipeCard {
  recipeId: string;
  title: string;
  imageUrl: string | null;
  imageStatus: "pending" | "ready" | "none";
  mode: RecommendationMode;
  missingIngredientCount: number;
  reasons: string[];
}

export interface TodayPantryTrack {
  featured: TodayRecipeCard | null;
  alternatives: TodayRecipeCard[];
}

export interface TodayDecision {
  policyVersion: string;
  mealType: RecommendationMealType | null;
  decisionReason: RecommendationDecision["decisionReason"];
  priorityProducts: TodayPriorityProduct[];
  pantry: TodayPantryTrack;
  discover: TodayRecipeCard[];
}
