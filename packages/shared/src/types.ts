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
