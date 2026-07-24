export const SEASON_KEYS = [
  'spring',
  'summer',
  'autumn',
  'winter',
  'all_year',
] as const;

export const RECIPE_SEASON_CLASSIFIER_VERSION = 'culinary-affinity-es-v1';

export type RecipeSeason = (typeof SEASON_KEYS)[number];
export type RecipeSeasonConfidence = 'high' | 'medium' | 'low';
export type RecipeSeasonSource = 'curated' | 'generated' | 'backfill';

export interface RecipeSeasonProfileInput {
  seasons: RecipeSeason[];
  confidence: RecipeSeasonConfidence;
  source: RecipeSeasonSource;
  classifierVersion: string;
}

interface RecipeSeasonRpcClient {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ error: unknown | null }>;
}

const SEASON_ORDER = new Map(
  SEASON_KEYS.map((season, index) => [season, index]),
);
const VALID_SEASONS = new Set<string>(SEASON_KEYS);

export function sanitizeGeneratedSeasonProfile(
  value: unknown,
  source: RecipeSeasonSource = 'generated',
): RecipeSeasonProfileInput | null {
  if (!value || typeof value !== 'object') return null;

  const seasons = (value as { seasons?: unknown }).seasons;
  if (!Array.isArray(seasons) || seasons.length === 0) return null;
  if (
    seasons.some((season) => typeof season !== 'string' || !VALID_SEASONS.has(season))
  ) {
    return null;
  }
  if (new Set(seasons).size !== seasons.length) return null;
  if (seasons.includes('all_year') && seasons.length !== 1) return null;

  const ordered = [...seasons].sort(
    (left, right) =>
      SEASON_ORDER.get(left as RecipeSeason)! -
      SEASON_ORDER.get(right as RecipeSeason)!,
  ) as RecipeSeason[];

  return {
    seasons: ordered,
    confidence: source === 'curated' ? 'high' : 'low',
    source,
    classifierVersion: RECIPE_SEASON_CLASSIFIER_VERSION,
  };
}

export async function upsertRecipeSeasonProfile(
  client: RecipeSeasonRpcClient,
  recipeId: string,
  profile: RecipeSeasonProfileInput,
): Promise<void> {
  const { error } = await client.rpc('upsert_recipe_season_profile', {
    p_recipe_id: recipeId,
    p_seasons: profile.seasons,
    p_confidence: profile.confidence,
    p_source: profile.source,
    p_classifier_version: profile.classifierVersion,
  });
  if (error) throw error;
}

export async function persistRecipeSeasonProfile(
  client: RecipeSeasonRpcClient,
  recipeId: string,
  profile: RecipeSeasonProfileInput | null | undefined,
): Promise<boolean> {
  if (!profile) return false;
  try {
    await upsertRecipeSeasonProfile(client, recipeId, profile);
    return true;
  } catch (error) {
    console.error('recipe-season-profile:', error);
    return false;
  }
}
