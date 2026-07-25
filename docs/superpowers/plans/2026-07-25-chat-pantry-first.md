# Chat catálogo-primero — Plan de implementación

**Goal:** El chat devuelve la receta del catálogo más cocinable con la despensa; genera solo si no
hay match; preserva modificaciones.

**Arquitectura:** RPC `household_recipe_ranking` (reutiliza `evaluate_recommendation_snapshot`) +
resolutor `resolveRecipeForChat` (match_recipes → ranking → best, o generación fallback) + flag
`is_modification` en la intención del chat. Ver
`docs/superpowers/specs/2026-07-25-chat-pantry-first-design.md`.

**Tech:** Supabase (Postgres, Deno Edge Functions), pgTAP.

---

### Task 1: RPC `household_recipe_ranking` + test pgTAP

**Files:**
- Create: `supabase/migrations/0064_household_recipe_ranking.sql`
- Create: `supabase/tests/0011_household_recipe_ranking.test.sql`

- [ ] Migración con la función tal cual el bloque SQL del spec (sección "RPC
  `household_recipe_ranking`"), con `revoke`/`grant`.
- [ ] Test pgTAP siguiendo el patrón de fixtures de `0009_household_today_decision.test.sql`
  (crear usuario `...0902`, despensa con un ingrediente que cubre una receta cook_now, otra receta
  shop_then_cook). Asserts del spec (sección Testing, a–d). `select plan(N)` acorde.
- [ ] Aplicar y verificar: `supabase migration up --local` y `pnpm test:db` → todos OK, sin flaky
  (correr 3 veces; el evaluador es determinista, no debe flakear).
- [ ] Commit.

### Task 2: Flag `is_modification` en `gemini.ts`

**Files:**
- Modify: `supabase/functions/_shared/gemini.ts`

- [ ] Añadir `is_modification?: boolean | null;` a la interfaz `ChatResponse` (junto a
  `pantry_only`, ~línea 153) con comentario.
- [ ] Añadir `is_modification: { type: 'BOOLEAN', nullable: true }` a `CHAT_SCHEMA.properties`.
- [ ] Añadir al `BASE_PROMPT` (en `chat/index.ts`, ver Task 4 — el prompt vive ahí, no en gemini.ts)
  la instrucción de cuándo marcar `is_modification`. NOTA: `BASE_PROMPT` está en
  `chat/index.ts:38-70`; esta parte del prompt se edita en Task 4. En `gemini.ts` solo el tipo y el
  schema.
- [ ] Commit.

### Task 3: `resolveRecipeForChat` en `recipe-pipeline.ts`

**Files:**
- Modify: `supabase/functions/_shared/recipe-pipeline.ts`

- [ ] Nueva función exportada `resolveRecipeForChat` con la firma y el flujo del spic (sección
  "Nuevo resolutor del chat"): combinar prefs+constraints; `embedText` + `match_recipes`
  (`match_count: 12`); si hay filas → `rpc('household_recipe_ranking', { p_recipe_ids, p_limit: 12 })`,
  tomar `candidates[0]`, mapear su `recipeId` a la fila de `match_recipes`, devolver
  `{ recipe, origin: 'db', missing }` (nombres de `missingIngredients`); si no hay filas o ranking
  vacío → reutilizar la rama de generación de `resolveRecipe` (rate-limit incluido), con la despensa
  como guía blanda cuando `constraints.pantry?.length` (además del modo duro `pantryOnly`). Devolver
  `missing: []` en generación.
- [ ] Refactor DRY: extraer la rama de generación de `resolveRecipe` (líneas 121-162) a un helper
  privado `generateAndSave(supabase, query, userId, prefs, constraints, { reusable })` y usarlo
  desde ambos (`resolveRecipe` y `resolveRecipeForChat`) para no duplicar. Añadir la guía blanda de
  despensa (no solo `pantryOnly`) dentro del helper cuando `constraints.pantry?.length`.
- [ ] `deno check` del fichero (o `pnpm --filter <edge> lint` si existe) para verificar tipos.
- [ ] Commit.

### Task 4: Cableado en `chat/index.ts`

**Files:**
- Modify: `supabase/functions/chat/index.ts`

- [ ] Importar `resolveRecipeForChat`.
- [ ] Añadir al `BASE_PROMPT` la instrucción de `is_modification` (spec, sección flag): marcar
  `true` al adaptar/cambiar una receta; `false` al pedir un plato de catálogo.
- [ ] Leer `is_modification` del resultado de `generateChat`.
- [ ] En `if (query)`: si `is_modification === true` → `resolveRecipe(..., { skipCache: true })`
  (actual); si no → `resolveRecipeForChat(...)` con `pantry: pantryNames` en constraints. Unificar el
  manejo de `rate_limited` y del `recipe`.
- [ ] Tras resolver con `origin === 'db'`: si `missing.length > 0`, componer
  `message + "\n\nTe faltarían: " + missing.slice(0,6).join(', ') + "."`; si `missing.length === 0`,
  añadir `"\n\nPuedes cocinarla ya con lo que tienes."`.
- [ ] `deno check`.
- [ ] Commit.

### Task 5: Revisión y despliegue

- [ ] `pnpm test:db` completo OK.
- [ ] Revisión por agente del diff de la rama.
- [ ] PR, merge (con confirmación del usuario), `supabase db push` + `supabase functions deploy chat`.
