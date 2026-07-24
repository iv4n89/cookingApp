import { spawn, spawnSync } from 'node:child_process';

const RECIPE_ID = '00000000-0000-0000-0000-000000008099';
const ROUNDS_PER_ORDER = 3;
const MINIMUM_BLOCK_MS = 500;

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr.trim() ?? `${command} exited ${result.status}`;
    throw new Error(detail);
  }
  return result.stdout;
}

function localDatabaseUrl() {
  const output = commandOutput('supabase', ['status', '-o', 'env']);
  const match = output.match(/^DB_URL="?([^"\n]+)"?$/m);
  if (!match) throw new Error('Local Supabase did not report DB_URL');
  return match[1];
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runPsql(databaseUrl, sql) {
  const child = spawn('psql', [
    databaseUrl,
    '-X',
    '-q',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`psql exited ${code}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function upsertSql(source, season) {
  const confidence = source === 'curated' ? 'high' : 'low';
  return `select public.upsert_recipe_season_profile(
    '${RECIPE_ID}'::uuid,
    array[${sqlLiteral(season)}]::text[],
    ${sqlLiteral(confidence)},
    ${sqlLiteral(source)},
    'concurrency-test-v1'
  );`;
}

function holderSql(source, season) {
  return `
    begin;
    ${upsertSql(source, season)}
    select pg_sleep(1);
    commit;
  `;
}

function contenderSql(source, season) {
  return `
    select pg_sleep(0.2);
    do $block$
    declare
      started_at timestamptz := clock_timestamp();
      elapsed_ms numeric;
    begin
      perform public.upsert_recipe_season_profile(
        '${RECIPE_ID}'::uuid,
        array[${sqlLiteral(season)}]::text[],
        ${sqlLiteral(source === 'curated' ? 'high' : 'low')},
        ${sqlLiteral(source)},
        'concurrency-test-v1'
      );
      elapsed_ms := extract(epoch from (clock_timestamp() - started_at)) * 1000;
      raise notice 'OVERLAP_MS:%', round(elapsed_ms);
    end;
    $block$;
  `;
}

function overlapMilliseconds(result) {
  const match = result.stderr.match(/OVERLAP_MS:(\d+)/);
  if (!match) throw new Error(`Contender did not report overlap: ${result.stderr.trim()}`);
  return Number(match[1]);
}

function executeSql(databaseUrl, sql) {
  return commandOutput('psql', [
    databaseUrl,
    '-X',
    '-q',
    '-t',
    '-A',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ]).trim();
}

async function race(databaseUrl, holder, contender, round) {
  executeSql(
    databaseUrl,
    `delete from public.recipe_season_profiles where recipe_id = '${RECIPE_ID}'::uuid`,
  );

  // Both clients are spawned before either promise is awaited. The contender starts
  // its write after 200 ms, while the holder keeps the conflicting row locked for 1 s.
  const holderPromise = runPsql(databaseUrl, holderSql(holder.source, holder.season));
  const contenderPromise = runPsql(
    databaseUrl,
    contenderSql(contender.source, contender.season),
  );
  const [, contenderResult] = await Promise.all([holderPromise, contenderPromise]);

  const overlapMs = overlapMilliseconds(contenderResult);
  if (overlapMs < MINIMUM_BLOCK_MS) {
    throw new Error(
      `Round ${round} did not prove overlap: contender blocked for only ${overlapMs} ms`,
    );
  }

  const finalSource = executeSql(
    databaseUrl,
    `select source from public.recipe_season_profiles where recipe_id = '${RECIPE_ID}'::uuid`,
  );
  if (finalSource !== 'curated') {
    throw new Error(`Round ${round} ended with ${finalSource || 'no profile'}, expected curated`);
  }
}

async function main() {
  commandOutput('psql', ['--version']);
  const databaseUrl = localDatabaseUrl();

  try {
    executeSql(
      databaseUrl,
      `insert into public.recipes (id, title, source)
       values ('${RECIPE_ID}'::uuid, 'Recipe season concurrency test', 'generated')
       on conflict (id) do nothing`,
    );

    let round = 0;
    for (const lowerSource of ['generated', 'backfill']) {
      for (let index = 0; index < ROUNDS_PER_ORDER; index += 1) {
        round += 1;
        await race(
          databaseUrl,
          { source: lowerSource, season: 'winter' },
          { source: 'curated', season: 'summer' },
          round,
        );
        round += 1;
        await race(
          databaseUrl,
          { source: 'curated', season: 'summer' },
          { source: lowerSource, season: 'winter' },
          round,
        );
      }
    }

    console.log(`Recipe season precedence passed ${round} overlapping races`);
  } finally {
    executeSql(
      databaseUrl,
      `delete from public.recipes where id = '${RECIPE_ID}'::uuid`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
