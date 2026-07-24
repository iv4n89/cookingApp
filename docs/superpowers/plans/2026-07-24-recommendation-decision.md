# Plan: datos seguros, estacionalidad y `RecommendationDecision`

**Objetivo:** entregar, en tres PR secuenciales, los datos de seguridad por
ingrediente, la afinidad culinaria estacional y un motor reproducible de
recomendaciones por hogar.

**Diseño aprobado:**
[`2026-07-24-recommendation-decision-design.md`](../specs/2026-07-24-recommendation-decision-design.md)

**Arquitectura:** Postgres conserva la fuente de verdad y el ranking. Los
datasets son versionados y reproducibles; las Edge Functions solo enriquecen
el catálogo al ingresar recetas. El móvil, Home, chat y el LLM no deciden ni
reordenan candidatas.

## Protocolo de ejecución

Este plan se ejecuta en tres sesiones de feature independientes:

1. `feat/ingredient-allergen-profiles`
2. `feat/recipe-season-profiles`
3. `feat/recommendation-decision`

Cada sesión debe:

1. partir de `main` actualizada;
2. implementar solo su slice;
3. ejecutar todas sus verificaciones;
4. abrir PR;
5. lanzar un agente revisor;
6. corregir y volver a revisar si aparece cualquier hallazgo relevante;
7. solicitar confirmación antes del merge;
8. fusionar y volver a `main` antes de comenzar la siguiente.

El directorio `.claude/` permanece fuera de todos los commits. No ejecutar
`supabase db reset` sobre la base local existente sin autorización explícita;
la validación destructiva desde cero se hará sobre una instancia desechable o
después de recibir permiso.

---

## Fase 0 — Descubrimiento documental consolidado

Esta fase ya se completó al escribir el plan. Cada sesión debe releer solo las
referencias de su slice y comprobar que siguen vigentes después de los merges.

### Fuentes del repositorio

- Flujo obligatorio: `CLAUDE.md`.
- Estado operativo: `docs/PROJECT_STATUS.md`.
- Diseño aprobado:
  `docs/superpowers/specs/2026-07-24-recommendation-decision-design.md`.
- Catálogo y seed:
  - `supabase/migrations/0006_ingredients.sql`;
  - `supabase/migrations/0007_ingredients_seed.sql`;
  - `scripts/seed/recipes.json`;
  - `scripts/seed/seed-recipes.mjs`.
- Patrón de dataset reproducible:
  - `scripts/validate-expiration-profiles.mjs`;
  - `scripts/generate-expiration-state-migration.mjs`;
  - `scripts/test-expiration-profiles-validator.mjs`;
  - `scripts/test-expiration-state-generator.mjs`;
  - `scripts/lib/find-duplicate-json-keys.mjs`;
  - `supabase/migrations/0049_expiration_profiles.sql`.
- Canonicalización y fallback de inventario/caducidad —no de seguridad—:
  - `supabase/migrations/0027_ingredients_canonical.sql`;
  - `supabase/migrations/0050_expiration_state_engine.sql:95-137`;
  - `supabase/tests/0005_expiration_state_engine.test.sql`.
- Ingreso de recetas:
  - `supabase/functions/_shared/gemini.ts:56-121`;
  - `supabase/functions/_shared/recipes.ts:6-73`;
  - `supabase/functions/_shared/recipes.ts:242-289`;
  - `supabase/functions/_shared/recipe-pipeline.ts`;
  - `supabase/functions/index-recipe/index.ts`;
  - `scripts/backfill-meal-types.mjs`.
- Recomendación y preferencias:
  - `supabase/migrations/0033_preference_maps.sql:6-59`;
  - `supabase/migrations/0033_preference_maps.sql:63-218`;
  - `supabase/migrations/0040_recommendations_use_household.sql`;
  - `supabase/functions/_shared/preferences.ts:5-69`.
- Hogar, cantidades y FEFO:
  - `supabase/migrations/0035_household_inventory_engine.sql:80-124`;
  - `supabase/migrations/0036_household_inventory_commands.sql:4-22`;
  - `supabase/migrations/0045_batch_consumption_helper.sql:2-49`;
  - `supabase/migrations/0048_consume_owned_projection.sql:20-74`;
  - `supabase/migrations/0050_expiration_state_engine.sql:4-144`.
- DTO y pgTAP:
  - `packages/shared/src/types.ts:127-151`;
  - `supabase/tests/0001_rls_contracts.test.sql`;
  - `supabase/tests/0004_inventory_consumption_restore.test.sql`;
  - `supabase/tests/0005_expiration_state_engine.test.sql`.

### Fuentes regulatorias permitidas

La curación del primer slice debe partir de fuentes primarias:

- Reglamento (UE) 1169/2011, anexo II:
  `https://eur-lex.europa.eu/legal-content/ES/ALL/?uri=celex:32011R1169`.
- Guía de aplicación de alérgenos de AESAN:
  `https://www.aesan.gob.es/AECOSAN/docs/documentos/seguridad_alimentaria/gestion_riesgos/guia_aplicacion_informacion.pdf`.
- Resumen científico de EFSA:
  `https://www.efsa.europa.eu/en/safe2eat/food-allergens`.

Las fuentes no autorizan inferir tolerancias clínicas individuales. V1 no
clasifica `fructose`, `histamine` ni `sorbitol`, y no certifica halal o kosher.

### APIs permitidas

#### Node 20 ESM

- `node:crypto/createHash`;
- `node:fs/promises`: `readFile`, `writeFile`, `mkdtemp`, `rm`;
- `node:path`, `node:url/fileURLToPath`;
- `node:child_process/spawnSync` para comandos secuenciales;
- `node:child_process/spawn` y `node:events/once` para procesos concurrentes;
- `node:os/tmpdir`;
- `findDuplicateJsonKeys(text)` del helper existente.

#### Deno y Supabase

- `Deno.env.get`, `fetch`;
- `SupabaseClient.from(...).select/insert/upsert/is/in/eq/single/maybeSingle`;
- `SupabaseClient.rpc(...)`;
- Gemini `generateContent` con `responseMimeType: application/json` y
  `responseSchema`.

#### PostgreSQL

- `public.current_household_id() returns uuid`;
- `public.require_household_member(uuid) returns uuid`;
- `public.convert_inventory_quantity(numeric, text, text) returns numeric`;
- `public.evaluate_expiration_state(integer, integer, boolean, timestamptz,
  timestamptz)`;
- `statement_timestamp()` una vez por decisión;
- `jsonb_array_elements`, `jsonb_to_recordset`, arrays, `cardinality`, `unnest`;
- RLS, `authenticated`, `anon`, `service_role`;
- pgTAP: `plan`, `finish`, `is`, `ok`, `results_eq`, `throws_ok`,
  `lives_ok`, `has_table`, `policies_are`, `has_function_privilege`.

### APIs y prácticas prohibidas

- No usar UUID de ingredientes o recetas de una base viva en migraciones
  portables.
- No derivar seguridad ni compatibilidad dietética de `recipes.allergens`,
  `recipes.diet` o una respuesta IA.
- No convertir ausencia de perfil en una lista vacía.
- No usar `scripts/canonicalize/mapping.json` como catálogo autoritativo.
- No ampliar vocabularios regulatorios de forma incidental.
- No llamar a `consume_household_batches(...)` para simular; escribe y bloquea.
- No llamar a `household_expiration_snapshot()` desde la decisión si eso
  captura un segundo reloj.
- No extender `recommended_recipes(...)`; permanece como compatibilidad.
- No aceptar del cliente hogar, inventario, reloj, estación, restricciones o
  score.
- No sumar gramos, mililitros y unidades entre sí.
- No añadir `totalScore` ni reordenar en móvil.
- No introducir índices, repositorios, servicios o Edge Functions sin una
  consulta o responsabilidad real.

---

# Slice 1 — Datos de seguridad por ingrediente

## Fase 1.1 — Crear la rama y fijar la política del dataset

### Qué implementar

Desde `main` actualizada, crear `feat/ingredient-allergen-profiles`.

Crear:

- `packages/shared/src/data/ingredient-allergen-profiles.json`;
- `docs/data/ingredient-allergen-sources.md`.

El JSON tendrá:

```text
schemaVersion
datasetVersion
supportedExclusions
supportedDiets
sources
ingredients[normalized_name]
  allergens
  incompatibleDiets
  compositionStatus
  sourceIds
  sourceRef
  reviewKind
```

Usar `ingredient-allergens-es-v1`. `supportedExclusions` contiene:

```text
gluten, crustaceans, molluscs, egg, fish, peanut, soy,
milk, nuts, celery, mustard, sesame, pork, alcohol
```

Cada uno de los 331 nombres del seed debe tener perfil. En
`exact_reviewed`, `allergens: []` o `incompatibleDiets: []` significa revisado
sin coincidencias; una clave ausente es inválida. En `variable_unknown`, los
arrays solo documentan coincidencias conocidas y nunca cobertura exhaustiva.

Para alimentos simples, copiar la categoría regulatoria de EUR-Lex/AESAN y
derivar de su composición las incompatibilidades `vegan`/`vegetarian`. Para
preparados variables —salsas, caldos, embutidos, panes o conservas sin
formulación concreta— usar `compositionStatus: "variable_unknown"`. Se pueden
registrar coincidencias conocidas como defensa adicional, pero nunca usar una
unión de elementos plausibles para afirmar exhaustividad. Solo una composición
concreta con referencia verificable usa `exact_reviewed`; únicamente entonces
se permiten arrays vacíos como evidencia revisada.

### Referencias

- Copiar la cobertura exacta de
  `scripts/generate-expiration-state-migration.mjs:7-67`.
- Copiar vocabulario vigente de
  `supabase/functions/_shared/preferences.ts:5-29`.
- Copiar estructura de fuentes de
  `packages/shared/src/data/ingredient-expiration-profiles.json`.

### Verificación

- 331 claves y 331 nombres del seed.
- Todas las filas tienen `allergens`, fuente y revisión.
- Todas tienen `incompatibleDiets` y `compositionStatus`.
- Ningún preparado genérico variable se marca `exact_reviewed`.
- Las condiciones no soportadas no aparecen en `supportedExclusions`.
- Revisión humana específica de compuestos y de los siete básicos asumidos.

### Guardas

- No usar IA para declarar seguridad.
- No convertir una lista conservadora plausible en prueba de ausencia.
- No tratar los 17 valores actuales como equivalentes regulatorios.
- No afirmar cobertura de sulfitos o altramuces; todavía no existen como
  preferencias estructuradas.
- No avanzar al generador hasta revisar la política de cada compuesto.

## Fase 1.2 — Validador y pruebas negativas

### Qué implementar

Crear:

- `scripts/validate-ingredient-allergen-profiles.mjs`;
- `scripts/test-ingredient-allergen-profiles-validator.mjs`.

El validador debe copiar el parser de seed y:

- detectar claves JSON duplicadas antes de `JSON.parse`;
- exigir campos permitidos y rechazar campos extra;
- comprobar cobertura exacta 331 ↔ 331;
- exigir `allergens` array no nulo, sin duplicados;
- exigir `incompatibleDiets` no nulo, limitado a `vegan`/`vegetarian`;
- exigir `compositionStatus` cerrado a `exact_reviewed` o
  `variable_unknown`;
- conservar el estado `variable_unknown` aunque sus arrays estén vacíos, sin
  reinterpretarlo como cobertura concluyente;
- cerrar el vocabulario a `supportedExclusions`;
- validar `sourceIds`, `sourceRef`, `reviewKind` y referencias existentes;
- distinguir perfil vacío de perfil ausente.

Fixtures negativos mínimos:

1. clave JSON duplicada;
2. ingrediente ausente;
3. ingrediente extra;
4. `allergens` ausente;
5. `allergens: null`;
6. alérgeno duplicado;
7. alérgeno desconocido;
8. fuente desconocida;
9. campo extra;
10. dieta incompatible desconocida;
11. composición desconocida;
12. preparado variable tratado como cobertura exacta.

Añadir scripts raíz:

```json
"validate:ingredient-allergens": "node scripts/validate-ingredient-allergen-profiles.mjs",
"test:ingredient-allergens": "node scripts/test-ingredient-allergen-profiles-validator.mjs"
```

### Referencias

- Copiar el detector de
  `scripts/lib/find-duplicate-json-keys.mjs`.
- Copiar harness `mkdtemp`/`spawnSync`/`finally` de
  `scripts/test-expiration-profiles-validator.mjs`.
- Copiar validación de campos de
  `scripts/validate-expiration-profiles.mjs`.

### Verificación

```bash
node --check scripts/validate-ingredient-allergen-profiles.mjs
node --check scripts/test-ingredient-allergen-profiles-validator.mjs
pnpm validate:ingredient-allergens
pnpm test:ingredient-allergens
git diff --check
```

### Guardas

- No duplicar el parser de JSON.
- No sanitizar silenciosamente datos inválidos.
- No validar solo el número de entries: perfiles vacíos legítimos no generan
  entries.

## Fase 1.3 — Generador reproducible y migración `0051`

### Qué implementar

Crear:

- `scripts/generate-ingredient-allergen-migration.mjs`;
- `scripts/test-ingredient-allergen-migration.mjs`;
- `supabase/migrations/0051_ingredient_allergen_profiles.sql` generado.

Copiar el modo escribir/`--check`, overrides de rutas y SHA-256 exacto de
`generate-expiration-state-migration.mjs`.

La migración crea cuatro tablas:

```text
ingredient_allergen_datasets
  version PK
  sha256
  supported_exclusions[]
  supported_diets[]

ingredient_allergen_profiles
  ingredient_id PK → ingredients
  dataset_version → ingredient_allergen_datasets
  source_ids[]
  source_ref
  review_kind
  composition_status

ingredient_allergen_entries
  ingredient_id → ingredient_allergen_profiles
  allergen
  PK (ingredient_id, allergen)

ingredient_diet_entries
  ingredient_id → ingredient_allergen_profiles
  incompatible_diet
  PK (ingredient_id, incompatible_diet)
```

Insertar perfiles mediante `ingredients.normalized_name`, nunca UUID. Un padre
exacto sin hijos representa vacío explícito; un padre `variable_unknown` sigue
siendo cobertura desconocida aunque tenga entries defensivas. Añadir `CHECK`
para vocabularios, estados, versiones y campos cerrados, y un bloque final que
exija exactamente 331 perfiles.

Aplicar RLS global a las cuatro tablas:

- `SELECT` para `authenticated`;
- DML solo para `service_role`;
- ningún grant a `anon`.

Tests del generador:

1. generación y `--check`;
2. divergencia de bytes;
3. ingrediente inexistente;
4. clave duplicada;
5. escape de comilla;
6. ausencia de UUID hardcodeado;
7. presencia de 331 perfiles aunque existan listas vacías.
8. estados exacto y variable renderizados sin perder su semántica;
9. incompatibilidades dietéticas renderizadas con vocabulario cerrado.

Añadir:

```json
"generate:ingredient-allergen-migration": "node scripts/generate-ingredient-allergen-migration.mjs",
"check:ingredient-allergen-migration": "node scripts/generate-ingredient-allergen-migration.mjs --check",
"test:ingredient-allergen-migration": "node scripts/test-ingredient-allergen-migration.mjs"
```

### Referencias

- Copiar checksum/render/`--check` de
  `scripts/generate-expiration-state-migration.mjs:98-207`.
- Copiar lookup por `normalized_name`, recuentos y grants de
  `supabase/migrations/0049_expiration_profiles.sql`.
- Copiar tests de escape y UUID de
  `scripts/test-expiration-state-generator.mjs`.

### Verificación

```bash
pnpm generate:ingredient-allergen-migration
pnpm check:ingredient-allergen-migration
pnpm test:ingredient-allergen-migration
git diff --check
```

### Guardas

- No hardcodear UUID.
- No almacenar `allergens text[]` en el perfil y perder la distinción
  padre/entries.
- No interpretar un padre `variable_unknown` sin entries como revisado vacío.
- No conceder DML a clientes.

## Fase 1.4 — Contratos pgTAP y cierre de la PR

### Qué implementar

Crear `supabase/tests/0006_ingredient_allergen_profiles.test.sql`.

Cubrir:

- tablas, constraints y recuento de 331 perfiles;
- perfil padre sin entries devuelve `[]`;
- `exact_reviewed` vacío se distingue de `variable_unknown` vacío;
- incompatibilidades `vegan`/`vegetarian` se persisten y validan;
- ausencia de padre permanece ausencia;
- entry duplicada y vocabulario desconocido fallan;
- `authenticated` lee y no escribe;
- `anon` no lee;
- `service_role` conserva DML;
- fixture donde perfiles canónico y directo difieren y siempre gana el
  ingrediente exacto;
- fixture donde existe perfil canónico pero falta el directo y la cobertura
  permanece desconocida.

No crear una RPC pública en este slice. Una consulta fixture equivalente a la
que copiará el motor debe demostrar explícitamente que no existe fallback
canónico para seguridad.

Actualizar `docs/PROJECT_STATUS.md` con rama, alcance y validaciones.

### Referencias

- Copiar transacción/roles de
  `supabase/tests/0005_expiration_state_engine.test.sql`.
- Reutilizar la estructura de fixtures canónico/directo de ese mismo archivo,
  invirtiendo la precedencia: seguridad usa solo el ingrediente exacto.
- Copiar `policies_are`, `throws_ok` y claims de
  `supabase/tests/0001_rls_contracts.test.sql`.

### Verificación

```bash
supabase migration up
pnpm validate:ingredient-allergens
pnpm test:ingredient-allergens
pnpm check:ingredient-allergen-migration
pnpm test:ingredient-allergen-migration
pnpm test:db
pnpm lint
pnpm typecheck
git diff --check
```

Abrir PR, lanzar revisor y corregir cualquier hallazgo. No comenzar el slice 2
hasta merge confirmado.

### Guardas

- No ejecutar reset destructivo sin permiso.
- No incluir `.claude/`.
- No fusionar con dudas sobre fuentes o compuestos.

---

# Slice 2 — Afinidad culinaria estacional

## Fase 2.1 — Tabla y contrato puro

### Qué implementar

Tras fusionar el slice 1, actualizar `main` y crear
`feat/recipe-season-profiles`.

Crear:

- `supabase/migrations/0052_recipe_season_profiles.sql`;
- `supabase/functions/_shared/recipe-seasons.ts`;
- `supabase/functions/_shared/recipe-seasons.test.ts`;
- `supabase/tests/0007_recipe_season_profiles.test.sql`;
- `scripts/test-recipe-season-profile-concurrency.mjs`.

La migración crea:

```text
recipe_season_profiles
  recipe_id PK → recipes on delete cascade
  seasons[] not null
  confidence: high|medium|low
  source: curated|generated|backfill
  classifier_version
  classified_at
```

Crear `public.valid_recipe_seasons(text[])` como helper `immutable` para
comprobar:

- array no vacío;
- vocabulario cerrado;
- sin duplicados;
- `all_year` solo o estaciones concretas sin `all_year`.

Revocar `EXECUTE` a `PUBLIC`, `anon` y `authenticated`; concederlo solo a
`service_role` si el `CHECK` lo requiere. RLS global: lectura autenticada, DML
solo `service_role`.

La misma migración crea la función privada
`upsert_recipe_season_profile(...)`. Debe usar una única sentencia
`INSERT ... ON CONFLICT DO UPDATE ... WHERE` para imponer atómicamente
`curated > generated/backfill`, aceptar reintentos idempotentes y evitar que
dos ingresos concurrentes decidan la precedencia en TypeScript. Revocar
`EXECUTE` a `PUBLIC`, `anon` y `authenticated`, y concederlo únicamente a
`service_role`.

El módulo puro exporta:

```text
SEASON_KEYS
RecipeSeason
RecipeSeasonConfidence
RecipeSeasonProfileInput
sanitizeGeneratedSeasonProfile(...)
RECIPE_SEASON_CLASSIFIER_VERSION = culinary-affinity-es-v1
```

El sanitizer rechaza el perfil entero ante valores desconocidos, vacío,
duplicados, confianza inválida o mezcla con `all_year`; no elimina errores y
guarda el resto. Ordena estaciones de forma estable.

La confianza no la decide Gemini:

- catálogo curado: `high`;
- generación y backfill: `low`;
- `medium` queda reservado a una revisión posterior.

### Referencias

- Copiar vocabularios puros de
  `supabase/functions/_shared/preferences.ts:5-34`.
- Copiar `immutable`, `search_path` y revokes de
  `supabase/migrations/0050_expiration_state_engine.sql:4-61`.
- Copiar RLS global de `0049_expiration_profiles.sql`.
- Copiar el patrón de funciones privadas y grants explícitos de
  `0050_expiration_state_engine.sql`.

### Verificación

```bash
deno test supabase/functions/_shared/recipe-seasons.test.ts
deno check supabase/functions/_shared/recipe-seasons.ts
supabase migration up
pnpm test:db
git diff --check
```

El pgTAP demuestra la matriz completa de precedencia, los reintentos y que la
función solo es ejecutable por `service_role`. Una prueba de integración con
dos conexiones simultáneas cubre la carrera `curated` frente a
`generated/backfill`.

`scripts/test-recipe-season-profile-concurrency.mjs` obtiene `DB_URL` del
Supabase local mediante `supabase status -o env`, crea una receta fixture
aislada y abre dos procesos `psql` con `spawn`, nunca con `spawnSync`. Cada
proceso se envuelve en una promesa; ambos se arrancan antes de esperar
`Promise.all`. Un proceso mantiene abierta la transacción después del primer
upsert para que el segundo alcance el mismo conflicto y quede bloqueado. El
harness prueba las dos órdenes —primero `generated/backfill` y primero
`curated`—, repite varias rondas, consulta el perfil final, exige
`source = curated` y limpia el fixture en `finally`. Debe fallar si Supabase
local o `psql` no están disponibles, si una conexión no llega al solapamiento
o si un proceso termina con error; no se convierte en skip.

Añadir al `package.json`:

```json
"test:recipe-season-concurrency": "node scripts/test-recipe-season-profile-concurrency.mjs"
```

El gate de esta fase es:

```bash
node --check scripts/test-recipe-season-profile-concurrency.mjs
pnpm test:recipe-season-concurrency
```

### Guardas

- No guardar tags libres como estación.
- No añadir GIN sin consulta real.
- No permitir `source`, versión o fecha desde IA.
- No implementar precedencia con `select` + `upsert` separados.
- Perfil ausente sigue siendo neutral.

## Fase 2.2 — Catálogo base versionado

### Qué implementar

Crear:

- `scripts/seed/recipe-season-profiles.json`;
- `scripts/validate-recipe-season-profiles.mjs`;
- `scripts/test-recipe-season-profiles-validator.mjs`.

El JSON contiene:

```text
schemaVersion
classifierVersion = culinary-affinity-es-v1
profiles[recipe title]
  seasons
  confidence = high
  source = curated
```

Clasificar manualmente las 24 recetas de `scripts/seed/recipes.json`. El título
solo une estos dos artefactos versionados; nunca es una clave runtime.

El validador exige:

- exactamente los mismos 24 títulos;
- títulos únicos en ambos archivos;
- ninguna receta extra o ausente;
- JSON sin claves duplicadas;
- vocabularios cerrados;
- `all_year` exclusivo;
- arrays no vacíos y sin duplicados;
- versión conocida.

Añadir:

```json
"validate:recipe-seasons": "node scripts/validate-recipe-season-profiles.mjs",
"test:recipe-seasons": "node scripts/test-recipe-season-profiles-validator.mjs"
```

### Referencias

- Copiar harness Node de los validadores de caducidad.
- Copiar formato base de `scripts/seed/recipes.json`.
- Copiar semántica estacional de la especificación aprobada, no inferir
  temporada de ingredientes.

### Verificación

```bash
node --check scripts/validate-recipe-season-profiles.mjs
node --check scripts/test-recipe-season-profiles-validator.mjs
pnpm validate:recipe-seasons
pnpm test:recipe-seasons
pnpm test:recipe-season-concurrency
git diff --check
```

### Guardas

- No usar UUID de recetas.
- No modificar las 24 recetas para convertir el perfil en tags.
- No clasificar “tomate = verano”; clasificar experiencia culinaria.

## Fase 2.3 — Integrar el perfil en generación, guardado y dedup

### Qué implementar

Modificar:

- `supabase/functions/_shared/gemini.ts`;
- `supabase/functions/_shared/recipes.ts`;
- `supabase/functions/_shared/recipe-pipeline.ts`;
- `supabase/functions/index-recipe/index.ts`;
- `scripts/seed/seed-recipes.mjs`.

En `GeneratedRecipe` y `RECIPE_SCHEMA`, añadir `seasons: string[]`. El prompt
explica afinidad culinaria en España y el vocabulario cerrado. El backend
asigna `source: generated`, `confidence: low` y la versión; Gemini solo propone
estaciones.

Ampliar `RecipeData` con `seasonProfile?: RecipeSeasonProfileInput`.
`recipeFromGenerated()` usa el sanitizer puro. Crear:

```ts
upsertRecipeSeasonProfile(
  supabase: SupabaseClient,
  recipeId: string,
  profile: RecipeSeasonProfileInput | null | undefined,
): Promise<void>
```

El helper TypeScript llama una función SQL privada
`upsert_recipe_season_profile(...)`; no hace `select` seguido de `upsert`.
Esa función ejecuta un único `INSERT ... ON CONFLICT DO UPDATE ... WHERE` y
aplica la precedencia dentro de PostgreSQL.

Reglas de precedencia:

- `curated` puede sustituir `generated` o `backfill`;
- ningún `backfill` sustituye un perfil existente;
- `generated` no sustituye `curated`;
- mismo origen y versión puede reintentarse idempotentemente.

Revocar `EXECUTE` a `PUBLIC`, `anon` y `authenticated`; concederlo solo a
`service_role`. Probar que escrituras concurrentes o reintentadas no permiten
que `generated`/`backfill` sobrescriban `curated`.

Llamar al helper:

- después de insertar en `saveRecipe`;
- antes del retorno temprano `deduped: true` de `index-recipe`.

`seed-recipes.mjs` une por título los dos artefactos validados y envía el
perfil curado. Un fallo de persistencia estacional se registra y deja la receta
neutral; no borra una receta ya insertada.

### Referencias

- Copiar `GeneratedRecipe`/`RECIPE_SCHEMA` de
  `gemini.ts:56-121`.
- Copiar `sanitizeKeys` y saneo doble de
  `recipes.ts:46-73` y `recipes.ts:273-279`.
- Copiar `upsert(..., { onConflict })` de
  `recipes.ts:184-230`.
- Copiar el patrón de función privada y grants explícitos de
  `0050_expiration_state_engine.sql`; mantener la precedencia en el `WHERE`
  del `ON CONFLICT`, no en el cliente.
- Leer el retorno dedup antes de tocar
  `supabase/functions/index-recipe/index.ts`.

### Verificación

```bash
deno test supabase/functions/_shared/recipe-seasons.test.ts
deno check \
  supabase/functions/_shared/gemini.ts \
  supabase/functions/_shared/recipe-seasons.ts \
  supabase/functions/_shared/recipes.ts \
  supabase/functions/_shared/recipe-pipeline.ts \
  supabase/functions/index-recipe/index.ts
pnpm validate:recipe-seasons
pnpm test:recipe-seasons
pnpm test:recipe-season-concurrency
pnpm lint
pnpm typecheck
git diff --check
```

Prueba local sin cloud:

1. insertar/sembrar una receta con perfil;
2. repetir la misma entrada para activar dedup;
3. comprobar que el UUID devuelto conserva el perfil curado;
4. lanzar escrituras concurrentes `curated` y `generated/backfill` sobre la
   misma receta mediante `pnpm test:recipe-season-concurrency` y comprobar que
   gana `curated`;
5. insertar una receta sin perfil y comprobar que sigue válida.

### Guardas

- No confiar solo en `saveRecipe`: dedup tiene retorno temprano.
- No hacer transacción ficticia entre dos llamadas Supabase.
- No sobrescribir curación con backfill.
- No decidir precedencia con lectura y escritura separadas en TypeScript.
- No convertir un fallo blando en borrado de receta.

## Fase 2.4 — Backfill build/review/apply y cierre

### Qué implementar

Crear:

- `scripts/recipe-seasons/build-profiles.mjs`;
- `scripts/recipe-seasons/apply-profiles.mjs`.

Añadir `scripts/recipe-seasons/*.local.json` a `.gitignore`.

`build-profiles.mjs`:

- lee recetas reutilizables sin perfil;
- solicita clasificación estructurada a Gemini;
- sanea y asigna `source: backfill`, `confidence: low`, versión v1;
- escribe un JSON local revisable;
- nunca modifica la BD.

`apply-profiles.mjs`:

- valida el artefacto completo;
- verifica UUID existente y `reusable = true`;
- hace upsert idempotente;
- no sustituye `curated`;
- informa aplicadas, omitidas, inválidas y desaparecidas.

El build necesita red y `GEMINI_API_KEY`, pero no es requisito de los tests ni
del merge. En la base local actual hay cientos de recetas reutilizables; su
backfill operacional se ejecuta y revisa aparte, sin commitear UUID locales.

Actualizar `docs/PROJECT_STATUS.md`.

### Referencias

- Copiar separación build/apply de
  `scripts/canonicalize/{build-mapping,apply-mapping}.mjs`.
- Copiar REST/service role y retry solo donde sea necesario de
  `scripts/backfill-meal-types.mjs`.

### Verificación

```bash
pnpm validate:recipe-seasons
pnpm test:recipe-seasons
pnpm test:recipe-season-concurrency
deno test supabase/functions/_shared/recipe-seasons.test.ts
deno check \
  supabase/functions/_shared/gemini.ts \
  supabase/functions/_shared/recipe-seasons.ts \
  supabase/functions/_shared/recipes.ts \
  supabase/functions/_shared/recipe-pipeline.ts \
  supabase/functions/index-recipe/index.ts
pnpm test:db
pnpm lint
pnpm typecheck
git diff --check
```

Abrir PR, lanzar revisor y no comenzar el slice 3 hasta merge confirmado.

### Guardas

- No ejecutar build/apply automáticamente.
- No commitear secretos ni artefactos con UUID locales.
- No hacer el merge dependiente de credenciales Gemini.

---

# Slice 3 — Motor `RecommendationDecision`

## Fase 3.1 — DTO compartido y helpers de política

### Qué implementar

Tras fusionar el slice 2, actualizar `main` y crear
`feat/recommendation-decision`.

Modificar `packages/shared/src/types.ts` copiando literalmente el contrato de
la especificación:

- estaciones, modos y razones;
- `RecommendationScoreBreakdown`;
- faltantes;
- inputs de lote, ingrediente y receta;
- `RecommendationSnapshot`;
- `RecommendationCandidate`;
- `RecommendationDecision`.

No añadir `totalScore`.

Crear:

- `supabase/migrations/0053_recommendation_decision.sql`;
- `supabase/tests/0008_recommendation_decision.test.sql`.

Empezar por helpers privados:

```text
recommendation_season(date) → text immutable
evaluate_recommendation_snapshot(jsonb, integer) → jsonb immutable
```

El evaluador recibe el snapshot completo y el límite; no lee tablas, identidad,
reloj ni configuración. Usa:

```text
policyVersion = recommendation-es-v1
assumedBasicsVersion = assumed-basics-es-v1
```

La política v1 incorpora como lista cerrada de necesidades soportadas:

```text
Frutos secos, Cacahuete, Marisco, Pescado, Huevo, Leche, Soja,
Sésamo, Mostaza, Apio, Lactosa, Gluten / celiaquía,
Sin cerdo, Sin alcohol
```

Todo `special_needs` fuera de esta lista activa
`unsupported_household_restriction`, incluso si
`need_allergen_map` contiene un mapeo aproximado heredado. Esto mantiene
`Halal`, `Kosher`, `Fructosa`, `Histamina`, `Sorbitol` y las condiciones
clínicas fuera de falsas garantías.

Los básicos se resuelven por los siete `normalized_name` aprobados. La fecha
usa meses meteorológicos. El límite se normaliza a `0..10`.

Revocar ambos helpers a `PUBLIC`, `anon` y `authenticated`.

### Referencias

- Copiar tipos de
  `docs/superpowers/specs/2026-07-24-recommendation-decision-design.md`,
  sección “Contrato conceptual”.
- Copiar funciones `immutable` y revokes de
  `0050_expiration_state_engine.sql:4-61`.
- Copiar conversiones únicamente mediante
  `public.convert_inventory_quantity(...)`.

### Verificación

```bash
pnpm typecheck
pnpm lint
git diff --check
```

Añadir pgTAP unitario con snapshots fijos para:

- límites de mes/estación;
- orden estable;
- `cook_now` antes que compra;
- ratios normalizados;
- básico asumido;
- perfil estacional ausente;
- restricción no soportada;
- límite 0, 5 y 10.

### Guardas

- No leer DB desde el evaluador.
- No capturar reloj.
- No aceptar una estación calculada por móvil.
- No duplicar conversión de unidades.

## Fase 3.2 — Constructor privado de snapshot

### Qué implementar

En `0053`, añadir:

```text
build_household_recommendation_snapshot(
  household_id uuid,
  requesting_user_id uuid,
  evaluated_at timestamptz,
  meal_type text
) → jsonb stable security definer
```

El helper:

1. valida `meal_type` contra el vocabulario o `NULL`;
2. deriva `evaluationDate` con `Europe/Madrid`;
3. une `special_needs` de todos los miembros;
4. compara las necesidades con la lista cerrada v1 y detecta cualquier
   `notes` no vacía;
5. deriva dieta solo desde `food_prefs` del solicitante;
6. carga lotes positivos enlazados a su `pantry_item_id`;
7. resuelve ingrediente canónico;
8. evalúa caducidad con el mismo `evaluated_at`;
9. carga recetas reutilizables y normaliza su JSON;
10. adjunta alérgenos, dietas incompatibles y estado de composición del
    ingrediente exacto; un perfil canónico no actúa como fallback;
11. adjunta perfil estacional o valores nulos;
12. devuelve el snapshot camelCase del DTO.

Para UUID de ingrediente inválido o ausente en JSON, usar una conversión
guardada; no hacer cast directo que aborte toda la decisión.

Caducidad:

- incluir todos los lotes disponibles;
- estado `null` si no hay perfil, no es prioritizable o está fuera de ventana;
- reutilizar `evaluate_expiration_state(...)` con el reloj explícito;
- no llamar a `household_expiration_snapshot()`.

Seguridad:

- el helper privado no se concede a clientes;
- todas las fuentes de hogar filtran por `household_id`;
- preferencias de miembros solo se unen a membresías del hogar;
- no incluir autoría de restricciones ni texto de notas.

### Referencias

- Copiar fail-closed de
  `0036_household_inventory_commands.sql:4-22`.
- Copiar lote/proyección de
  `0050_expiration_state_engine.sql:95-137`.
- Copiar la forma de join de perfiles de
  `0050_expiration_state_engine.sql:120-125`, pero no su precedencia:
  caducidad admite canonicalización; seguridad exige coincidencia directa.
- Copiar preferencias de
  `0033_preference_maps.sql:101-118`, cambiando la fuente al hogar.
- Copiar JSON de ingredientes de
  `0033_preference_maps.sql:139-146`, añadiendo cast seguro.

### Verificación

Con fixtures fijos, inspeccionar que el snapshot:

- no contiene otro hogar;
- une alergias de owner y member;
- usa dieta solo del solicitante;
- marca condición o notas no soportadas sin exponerlas;
- incluye lotes sin urgencia con `expirationStatus: null`;
- distingue perfil de seguridad vacío de ausente;
- distingue composición exacta de preparada/variable;
- conserva incompatibilidades dietéticas curadas aunque `recipes.diet` sea
  falsa o nula;
- conserva versión de seguridad y estacionalidad.

### Guardas

- No confiar en RLS dentro de `security definer`.
- No usar `current_household_id()` dentro del helper con household explícito;
  solo la RPC pública deriva identidad.
- No omitir lotes porque no tengan estado de caducidad.
- No incluir notas libres en el DTO.

## Fase 3.3 — Disponibilidad, FEFO y ranking puro

### Qué implementar

Completar `evaluate_recommendation_snapshot(...)`.

Para cada receta:

1. aplicar filtros de seguridad por atributos curados de ingredientes y
   `recipes.allergens` como defensa adicional;
2. aplicar dieta requerida exclusivamente desde `incompatibleDiets` curadas;
   no usar `recipes.diet` como evidencia positiva;
3. agrupar líneas compatibles por ingrediente canónico;
4. excluir básicos de faltantes y urgencia;
5. simular asignación FEFO sin `FOR UPDATE` ni escrituras;
6. convertir cantidades con `convert_inventory_quantity`;
7. producir faltantes por ausencia, insuficiencia, UUID desconocido o unidad
   incompatible;
8. calcular medias por ingrediente de `priorityUsage`,
   `consumeSoonUsage` y `availabilityRatio`;
9. calcular afinidad estacional `high=1`, `medium=.75`, `low=.5`;
10. ordenar lexicográficamente y asignar `rank`.

Orden normativo:

```text
cook_now
priorityUsage
consumeSoonUsage
seasonalAffinity
mealTypeMatch
availabilityRatio
menos faltantes
recipeId
```

Si existe `cook_now`, seleccionar la primera. En caso contrario, seleccionar
la primera `shop_then_cook`. Devolver una principal más el número solicitado
de alternativas. Sin candidatas, devolver `no_safe_candidate`. Con condiciones
o notas no soportadas, devolver `unsupported_household_restriction`.

El FEFO simulado copia:

```sql
order by coalesce(purchased_at, created_at), created_at, batch_id
```

pero nunca copia `FOR UPDATE`, `UPDATE`, eventos ni comandos.

### Referencias

- Copiar orden y conversiones de
  `0048_consume_owned_projection.sql:20-74`.
- Copiar semántica de perfil ausente de
  `0050_expiration_state_engine.sql`.
- Copiar códigos y ranking de la especificación; no copiar buckets o
  embeddings de `recommended_recipes`.

### Verificación

Tests puros con snapshots:

- cantidad suficiente e insuficiente;
- `g ↔ kg`, `ml ↔ l/cucharada/cucharadita`;
- unidad incompatible;
- ingrediente desconocido;
- sal/aceite común asumido y aceite específico obligatorio;
- consumo FEFO repartido entre varios lotes;
- `priority` domina estación;
- `consume_soon` domina estación;
- verano rompe empate;
- franja rompe el siguiente;
- UUID rompe empate total;
- mismo snapshot produce JSON idéntico.

### Guardas

- No sumar cantidades de dimensiones distintas.
- No declarar `cook_now` con cantidad nula no básica.
- No mutar inventario.
- No usar embedding o diversidad semántica en v1.

## Fase 3.4 — RPC pública, autorización y pgTAP integral

### Qué implementar

Añadir:

```sql
public.household_recommendation_decision(
  p_meal_type text default null,
  p_alternative_limit integer default 5
) returns jsonb
```

La RPC:

1. captura `auth.uid()`, `current_household_id()` y un único
   `statement_timestamp()`;
2. falla si no existe usuario/hogar;
3. llama `require_household_member`;
4. construye el snapshot privado;
5. llama el evaluador privado;
6. devuelve el DTO.

Usar `stable security definer set search_path = ''`. Revocar a `PUBLIC` y
`anon`; conceder solo a `authenticated`.

Completar `supabase/tests/0008_recommendation_decision.test.sql`.

Fixtures:

- owner, member y externo;
- preferencias híbridas;
- recetas verano/invierno, dietas y alérgenos;
- ingrediente con perfil exacto vacío, con alérgeno, variable y sin perfil;
- lotes con unidades, cantidades y estados distintos;
- básicos y aceite específico.

Demostrar:

- alergia de otro miembro excluye;
- etiqueta de receta es defensa adicional;
- dieta de otro miembro no filtra y la del solicitante sí;
- `recipes.diet` falsamente positiva no habilita una receta incompatible;
- `recipes.diet = null` no bloquea una receta compatible demostrada por
  ingredientes exactos;
- un preparado `variable_unknown` se excluye con dieta o alergia activa;
- perfil de seguridad ausente excluye con restricciones;
- nota/condición no soportada devuelve decisión vacía;
- owner y member comparten inventario;
- externo no ve datos;
- `cook_now`/fallback funcionan;
- ninguna llamada escribe lotes, proyecciones o ledger;
- helper privado no es ejecutable;
- `anon` no ejecuta RPC;
- `authenticated` sí ejecuta RPC;
- DTO contiene todas las claves y versiones.

Actualizar `docs/PROJECT_STATUS.md`.

### Referencias

- Copiar RPC pública de
  `0050_expiration_state_engine.sql:63-144`.
- Copiar claims y hogares de
  `0005_expiration_state_engine.test.sql`.
- Copiar reconciliación/FEFO de
  `0004_inventory_consumption_restore.test.sql`.

### Verificación

```bash
supabase migration up
pnpm test:db
pnpm lint
pnpm typecheck
pnpm validate:ingredient-allergens
pnpm test:ingredient-allergens
pnpm check:ingredient-allergen-migration
pnpm test:ingredient-allergen-migration
pnpm validate:recipe-seasons
pnpm test:recipe-seasons
pnpm test:recipe-season-concurrency
deno test supabase/functions/_shared/recipe-seasons.test.ts
deno check \
  supabase/functions/_shared/gemini.ts \
  supabase/functions/_shared/recipe-seasons.ts \
  supabase/functions/_shared/recipes.ts \
  supabase/functions/_shared/recipe-pipeline.ts \
  supabase/functions/index-recipe/index.ts
rg -n \"recommended_recipes|Gemini|generateContent\" \
  supabase/migrations/0053_recommendation_decision.sql
git diff --check
```

El `rg` no debe encontrar delegación al ranking heredado ni IA; comentarios de
guardas se revisan manualmente.

Abrir PR, lanzar agente revisor, corregir y volver a revisar. Pedir
confirmación antes del merge.

### Guardas

- No cambiar Home/chat ni retirar la RPC heredada.
- No persistir decisiones.
- No iniciar el siguiente rediseño antes de merge validado.

---

## Fase final — Verificación transversal y memoria

Después de fusionar los tres slices:

1. actualizar `main`;
2. confirmar que no quedan PR abiertas;
3. comprobar `docs/PROJECT_STATUS.md`;
4. ejecutar la suite completa no destructiva;
5. inspeccionar ACL, policies y recuentos;
6. confirmar que `.claude/` continúa sin seguimiento;
7. registrar como validación operativa pendiente un reset desde cero en base
   desechable, si todavía no fue autorizado.

Checklist:

```bash
pnpm validate:ingredient-allergens
pnpm test:ingredient-allergens
pnpm check:ingredient-allergen-migration
pnpm test:ingredient-allergen-migration
pnpm validate:recipe-seasons
pnpm test:recipe-seasons
pnpm test:recipe-season-concurrency
deno test supabase/functions/_shared/recipe-seasons.test.ts
pnpm test:db
pnpm lint
pnpm typecheck
git diff --check
git status --short
```

No se diseña ni implementa la migración de Home hasta que esta verificación
esté completa.
