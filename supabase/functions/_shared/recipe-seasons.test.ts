import {
  persistRecipeSeasonProfile,
  RECIPE_SEASON_CLASSIFIER_VERSION,
  sanitizeGeneratedSeasonProfile,
  upsertRecipeSeasonProfile,
} from './recipe-seasons.ts';

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
}

Deno.test('accepts a valid profile and uses stable season ordering', () => {
  assertEquals(
    sanitizeGeneratedSeasonProfile({
      seasons: ['winter', 'spring', 'autumn'],
      confidence: 'high',
    }),
    {
      seasons: ['spring', 'autumn', 'winter'],
      confidence: 'low',
      source: 'generated',
      classifierVersion: RECIPE_SEASON_CLASSIFIER_VERSION,
    },
  );
});

Deno.test('only curated input receives high confidence', () => {
  assertEquals(
    sanitizeGeneratedSeasonProfile({ seasons: ['summer'] }, 'curated'),
    {
      seasons: ['summer'],
      confidence: 'high',
      source: 'curated',
      classifierVersion: RECIPE_SEASON_CLASSIFIER_VERSION,
    },
  );
  assertEquals(
    sanitizeGeneratedSeasonProfile({ seasons: ['summer'] }, 'backfill')
      ?.confidence,
    'low',
  );
});

for (
  const [name, value] of [
    ['missing seasons', {}],
    ['empty seasons', { seasons: [] }],
    ['unknown season', { seasons: ['monsoon'] }],
    ['duplicate season', { seasons: ['summer', 'summer'] }],
    ['all_year mixed with another season', { seasons: ['all_year', 'winter'] }],
    ['non-string season', { seasons: [42] }],
  ] as const
) {
  Deno.test(`rejects ${name}`, () => {
    assertEquals(sanitizeGeneratedSeasonProfile(value), null);
  });
}

Deno.test('calls the atomic RPC with the complete profile', async () => {
  let received:
    | { functionName: string; parameters: Record<string, unknown> }
    | null = null;
  const client = {
    rpc(functionName: string, parameters: Record<string, unknown>) {
      received = { functionName, parameters };
      return Promise.resolve({ error: null });
    },
  };
  const profile = sanitizeGeneratedSeasonProfile({ seasons: ['summer'] })!;

  await upsertRecipeSeasonProfile(client, 'recipe-id', profile);

  assertEquals(received, {
    functionName: 'upsert_recipe_season_profile',
    parameters: {
      p_recipe_id: 'recipe-id',
      p_seasons: ['summer'],
      p_confidence: 'low',
      p_source: 'generated',
      p_classifier_version: RECIPE_SEASON_CLASSIFIER_VERSION,
    },
  });
});

Deno.test('season persistence is soft when the RPC fails', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const persisted = await persistRecipeSeasonProfile(
      {
        rpc: () => Promise.resolve({ error: new Error('database unavailable') }),
      },
      'recipe-id',
      sanitizeGeneratedSeasonProfile({ seasons: ['winter'] }),
    );
    assertEquals(persisted, false);
  } finally {
    console.error = originalConsoleError;
  }
});
