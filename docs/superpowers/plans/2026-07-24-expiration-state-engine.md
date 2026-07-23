# Plan de implementación: motor de estados aproximados de caducidad

## Objetivo y alcance

Implementar el diseño aprobado en
`docs/superpowers/specs/2026-07-24-expiration-state-engine-design.md`: cargar en
Postgres los perfiles versionados, evaluar lotes como `fresh`,
`consume_soon` o `priority` y exponer un snapshot de solo lectura por hogar.

Este slice no modifica móvil, Home, chat ni recomendaciones. Los lotes que
superan `maxDays` no aparecen en el resultado accionable.

## Fase 0 — Descubrimiento consolidado

### Fuentes autoritativas

- Diseño aprobado:
  `docs/superpowers/specs/2026-07-24-expiration-state-engine-design.md`.
- Dataset y sus invariantes:
  `packages/shared/src/data/ingredient-expiration-profiles.json` y
  `scripts/validate-expiration-profiles.mjs`.
- Contratos camelCase y unions literales:
  `packages/shared/src/types.ts`; `packages/shared/src/index.ts` ya reexporta
  `types.js`.
- Catálogo global y RLS de solo lectura:
  `supabase/migrations/0006_ingredients.sql:4-21`.
- Canonicalización:
  `supabase/migrations/0027_ingredients_canonical.sql:1-5`.
- Hogares, lotes y RLS:
  `supabase/migrations/0035_household_inventory_engine.sql:76-97,139-202`.
- Comprobación de membresía:
  `public.require_household_member(uuid) returns uuid` en
  `0036_household_inventory_commands.sql:4-22`.
- Selección de lotes activos, canon y helper privado:
  `supabase/migrations/0048_consume_owned_projection.sql:2-78`.
- Fixtures de Auth/RLS y permisos:
  `supabase/tests/0001_rls_contracts.test.sql`,
  `0003_inventory_projection_guards.test.sql:46-53` y
  `0004_inventory_consumption_restore.test.sql:15-136`.
- Scripts Node ESM y pruebas sin dependencias:
  `scripts/validate-expiration-profiles.mjs` y
  `scripts/test-expiration-profiles-validator.mjs`.

### APIs permitidas

- Node 20 ESM: `readFile`, `writeFile`, `createHash('sha256')`,
  `dirname`, `join`, `resolve`, `fileURLToPath`, `spawnSync`, `mkdtemp`,
  `tmpdir` y `rm`.
- SQL: `auth.uid()`, `public.current_household_id()`,
  `public.require_household_member(uuid)`, `statement_timestamp()`,
  `extract(epoch from interval)`, `greatest`, `least` y `coalesce`.
- pgTAP ya usado: `plan`, `is`, `ok`, `results_eq`, `throws_ok`,
  `lives_ok`, `policies_are` y `finish`.

### Hechos que condicionan el plan

- Los 331 identificadores estables del dataset son `normalized_name`; los UUID
  se generan al aplicar el seed.
- La canonicalización operativa no está versionada como migración. Un destino
  canónico runtime puede no estar entre los 331 nombres.
- El snapshot debe buscar primero el perfil del canónico y usar como fallback
  el perfil directo del ingrediente. Un join exclusivamente canónico omitiría
  lotes válidos.
- `pantry_batches.pantry_item_id` es nullable. El snapshot excluirá lotes
  huérfanos, igual que el consumidor vigente.
- Los perfiles no prioritizables pueden conservar rangos numéricos; solo el
  perfil indefinido exige ambos rangos nulos.

### Guardas

- No hardcodear UUID de ingredientes.
- No consultar una base runtime desde el generador.
- No mantener una segunda lista manual de 331 asignaciones.
- No ocultar ausencias o duplicados con `on conflict do nothing`.
- No usar `age()` ni truncar a días enteros.
- No aceptar hogar ni reloj desde el cliente.
- No confiar en RLS dentro de una función `security definer`.

## Fase 1 — Contratos compartidos

### Implementar

En `packages/shared/src/types.ts`, copiar el patrón de unions e interfaces
planas existente y añadir:

```ts
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
```

No tocar `packages/shared/src/index.ts`: ya ejecuta
`export * from "./types.js";`.

### Verificar

- `pnpm --filter @recetas/shared exec tsc --noEmit -p tsconfig.json`.
- `rg "ExpirationBatchSnapshot|ExpirationStatus" packages/shared/src`.

### Guardas

- No incluir un estado `expired` o `review_required`.
- No declarar `pantryItemId` nullable: los lotes huérfanos se excluyen.
- No añadir textos traducidos al DTO; usar códigos de razón.

## Fase 2 — Generador y migración de datos de referencia

### Implementar el generador

Crear `scripts/generate-expiration-state-migration.mjs`, copiando:

- resolución ESM de rutas de
  `scripts/validate-expiration-profiles.mjs:30-38`;
- checksum sobre bytes exactos mediante `createHash('sha256')`;
- escape SQL estrecho:

```js
function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
```

El script generará de forma completa
`supabase/migrations/0049_expiration_profiles.sql`. Sin argumentos escribe el
archivo; con `--check` compara bytes y falla si no coincide. Para fixtures,
admitirá rutas alternativas mediante `EXPIRATION_PROFILES_PATH` y
`EXPIRATION_MIGRATION_PATH`, copiando el patrón de override ya usado por
`scripts/validate-expiration-profiles.mjs`.

Añadir scripts raíz:

```json
"generate:expiration-migration": "node scripts/generate-expiration-state-migration.mjs",
"check:expiration-migration": "node scripts/generate-expiration-state-migration.mjs --check"
```

### Contenido generado de `0049_expiration_profiles.sql`

1. Comentario de cabecera con el SHA-256 del JSON.
2. Tabla `public.expiration_profiles`:
   - `id text primary key`;
   - `min_days int`, `max_days int`;
   - `confidence` con enum cerrado;
   - `priority_eligible boolean not null`;
   - `source_id text not null`, `source_ref text not null`;
   - check que permita rango positivo/ordenado o ambos nulos únicamente si no
     es prioritizable.
3. Tabla `public.ingredient_expiration_profiles`:
   - `ingredient_id uuid primary key references public.ingredients(id)`;
   - `profile_id text not null references public.expiration_profiles(id)`;
   - `match_type` con enum cerrado.
4. Insert de los 96 perfiles desde JSON.
5. Insert de los 331 mapeos mediante `values(normalized_name, profile_id,
   match_type)` unido a `public.ingredients.normalized_name`.
6. Bloque `do` que falle si no existen exactamente 96 perfiles y 331 mapeos.
7. RLS y policies globales de lectura copiadas de
   `0006_ingredients.sql:16-21`.
8. `grant select` a `authenticated`; DML solo a `service_role`.

Los mapeos se guardan contra el ingrediente exacto del seed. La preferencia
por el canónico se resolverá al consultar.

### Pruebas del generador

Crear `scripts/test-expiration-state-generator.mjs` copiando el harness
`spawnSync`/`mkdtemp`/`finally` de
`scripts/test-expiration-profiles-validator.mjs`.

Cubrir:

- `--check` pasa con el dataset real;
- una edición del dataset cambia el checksum y hace fallar `--check`;
- un ingrediente inexistente o duplicado hace fallar la generación;
- comillas simples se escapan correctamente;
- la salida contiene 96 perfiles y 331 mapeos, sin UUID hardcodeados.

Añadir `test:expiration-migration` al `package.json`.

### Verificar

- `node --check` sobre ambos scripts.
- `pnpm validate:expiration-profiles`.
- `pnpm test:expiration-profiles`.
- `pnpm generate:expiration-migration`.
- `pnpm check:expiration-migration`.
- `pnpm test:expiration-migration`.
- `git diff --check`.

### Guardas

- No generar solo un fragmento ambiguo de una migración manual.
- No reserializar el JSON antes de calcular el checksum.
- No usar dependencias nuevas ni una librería de plantillas.
- No insertar perfiles por UUID.

## Fase 3 — Evaluador privado y snapshot del hogar

### Migración

Crear manualmente `supabase/migrations/0050_expiration_state_engine.sql`.

### Evaluador privado

Implementar:

```sql
public.evaluate_expiration_state(
  p_min_days integer,
  p_max_days integer,
  p_priority_eligible boolean,
  p_acquired_at timestamptz,
  p_evaluated_at timestamptz
)
returns table (
  age_days numeric,
  status text,
  reason_code text
)
```

Copiar el estilo SQL `immutable set search_path = ''` de
`public.convert_inventory_quantity` en
`0045_batch_consumption_helper.sql:2-16`.

Regla única:

```text
age_days       = max((evaluated_at - acquired_at) en segundos / 86400, 0)
warning_days   = min(min_days * 0.25, 7)
consume_at     = min_days - warning_days
```

Devolver estado nulo para perfil no prioritizable, rango nulo o
`age_days > max_days`. Aplicar los límites exactos de la especificación.

Revocar inmediatamente:

```sql
revoke execute on function public.evaluate_expiration_state(
  integer, integer, boolean, timestamptz, timestamptz
) from public, anon, authenticated;
```

### Snapshot público

Implementar `public.household_expiration_snapshot()` sin argumentos, como
`stable security definer set search_path = ''`, con columnas snake_case
equivalentes a `ExpirationBatchSnapshot`.

Copiar el fail-closed de `0036_household_inventory_commands.sql:4-22`:

```sql
v_household := public.current_household_id();
if v_household is null then raise exception 'hogar no encontrado'; end if;
perform public.require_household_member(v_household);
```

La consulta debe:

- capturar `statement_timestamp()` una sola vez;
- filtrar explícitamente `pb.household_id = v_household`;
- exigir `coalesce(pb.remaining_quantity, 0) > 0`;
- exigir `pb.ingredient_id is not null` y `pb.pantry_item_id is not null`;
- unir `pantry_items` por `pantry_item_id` y el mismo hogar;
- buscar dos mappings:
  - canónico: `coalesce(i.canonical_id, i.id)`;
  - directo: `i.id`;
- elegir `coalesce(canonical_mapping.profile_id,
  direct_mapping.profile_id)`;
- aplicar el evaluador mediante `lateral`;
- devolver únicamente estados no nulos.

Revocar `EXECUTE` por defecto y concederlo solo a `authenticated`.

### Verificar

- `supabase migration up` en la base local existente.
- Introspección de `pg_proc`, ACL, policies y recuentos 96/331.
- `rg` confirma que no existe cálculo de estados en móvil o Edge Functions.

### Guardas

- No usar `clock_timestamp()` por fila.
- No aceptar `p_household_id` ni `p_evaluated_at` en la RPC pública.
- No depender solo del mapping canónico.
- No devolver lotes fuera de `maxDays`.
- No conceder `EXECUTE` del helper a `PUBLIC`.

## Fase 4 — Pruebas pgTAP del motor y autorización

### Archivo

Crear `supabase/tests/0005_expiration_state_engine.test.sql`.

### Evaluador determinista

Antes de cambiar a `role authenticated`, probar el helper privado con
timestamps fijos:

- justo antes, en y después de `consumeSoonAt`;
- justo antes, en y después de `minDays`;
- exactamente `maxDays` y después de `maxDays`;
- perfil 1–2 días;
- perfil largo con aviso limitado a siete días;
- fecha futura que produce edad cero;
- perfil no prioritizable con rango numérico;
- perfil indefinido con rangos nulos.

### Snapshot y canonicalización

Copiar fixtures de ingrediente/variante/lote de
`0004_inventory_consumption_restore.test.sql:15-136`.

Cubrir:

- `purchased_at` tiene prioridad sobre `created_at`;
- fallback a `created_at`;
- solo cantidad positiva;
- omisión de lote sin ingrediente, sin perfil o sin `pantry_item_id`;
- perfil canónico preferido cuando existe;
- perfil directo usado si el destino canónico runtime no tiene mapping;
- lote posterior a `maxDays` omitido.

### Hogares y permisos

Copiar claims/roles de `0001_rls_contracts.test.sql`.

Crear owner, miembro y externo. El trigger crea tres hogares; eliminar el hogar
personal del futuro miembro y añadirlo al hogar del owner antes de ejecutar
como `authenticated`.

Demostrar:

- owner y member reciben el mismo snapshot;
- el externo no recibe lotes del hogar;
- `authenticated` puede leer tablas globales pero no insertar/actualizar;
- `authenticated` no tiene privilegio sobre
  `evaluate_expiration_state(...)`;
- `anon` no ejecuta `household_expiration_snapshot()`.

### Verificar

- `pnpm test:db`.
- El plan de pgTAP coincide con el número real de aserciones.
- Las pruebas no dependen de `now()` cerca de los límites.

### Guardas

- No probar límites temporales mediante la RPC con reloj real.
- No dejar al segundo miembro en dos hogares: `unique(user_id)` lo impide.
- No ejecutar pruebas de autorización como `postgres` por accidente.

## Fase 5 — Memoria, verificación final y PR

### Documentación

Actualizar `docs/PROJECT_STATUS.md`:

- PR #90 queda como primer slice completado;
- este motor es el segundo slice de Fase 2;
- el siguiente trabajo sigue siendo integrar estados en
  `RecommendationDecision`, no rediseñar Home/chat.

### Batería final

Ejecutar:

```text
node --check scripts/generate-expiration-state-migration.mjs
node --check scripts/test-expiration-state-generator.mjs
pnpm validate:expiration-profiles
pnpm test:expiration-profiles
pnpm check:expiration-migration
pnpm test:expiration-migration
pnpm lint
pnpm typecheck
pnpm test:db
git diff --check
```

Aplicar todas las migraciones desde cero con `supabase db reset` únicamente en
una instancia local confirmada como desechable. Si contiene datos que deban
conservarse, no resetearla: usar una instancia desechable separada y dejar
constancia de la validación.

### Entrega

1. Revisar que `.claude/` no esté staged.
2. Abrir PR a `main`.
3. Lanzar agente revisor sobre el commit exacto.
4. Corregir todos los bloqueantes y volver a revisar.
5. Solicitar confirmación del usuario antes de fusionar.
6. No comenzar la integración de recomendaciones hasta que esta PR esté
   validada y fusionada.

## Criterio de salida

- JSON y migración coinciden de forma reproducible.
- Postgres calcula los tres estados con una única regla temporal.
- Los lotes fuera de ventana no producen acciones.
- El fallback canónico/directo evita omisiones silenciosas.
- Owner y member comparten snapshot; un externo queda aislado.
- No existe lógica duplicada en móvil, Edge Functions o prompts.
