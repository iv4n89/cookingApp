# Diseño: Home "decisión de hoy"

Fecha: 2026-07-24. Estado: aprobado.

## Contexto

Cierre de la Fase 2. El motor determinista `household_recommendation_decision`
(PR #95) y el snapshot de caducidad `household_expiration_snapshot` existen en
la base y están tipados en `@recetas/shared`, pero ningún cliente los consume:
la Home sigue usando la RPC antigua `recommended_recipes`, que no aporta
caducidad, prioridad, score ni razones.

La visión (`docs/vision_producto_app_cocina.md`) pide que la Home priorice, en
este orden: 1) productos a punto de caducar, 2) recetas para aprovecharlos,
3) compra. El plan maestro lo concreta como "Home consume un único DTO
decisión de hoy".

## Decisión de arquitectura

Una RPC nueva `household_today_decision(p_meal_type, p_alternative_limit)`
compone en backend un DTO listo para pintar, sin duplicar lógica:

- Llama a `household_recommendation_decision(...)` para la decisión (elegida +
  candidatas rankeadas, con `mode`, `score`, `reasonCodes`, `missingIngredients`).
- Lee `household_expiration_snapshot()` para los productos prioritarios
  (nombre, estado, fecha estimada, confianza).
- Une los `recipeId` de las candidatas con `recipes` para los datos de pintado
  (título, `image_url`, `image_status`, tiempos, raciones).
- Agrega los `missingIngredients` de las candidatas `shop_then_cook` en una
  lista de compra deduplicada.

El móvil solo consume: un wrapper en `lib` y `useHome` reescrito. El motor ya
revisado y fusionado no se modifica. `current_meal_type` del cliente ya
devuelve las claves que el motor espera (`desayuno/almuerzo/merienda/cena`),
así que se pasa la franja horaria sin mapeo.

## DTO `TodayDecision` (nuevo en `packages/shared/src/types.ts`)

- `priorityProducts[]`: `{ name, status: 'priority' | 'consume_soon',
  estimatedDate: string | null, confidence }`. `estimatedDate` se deriva de
  `acquired_at + min_days` del snapshot de caducidad (inicio estimado de la
  ventana prioritaria); `null` si faltan datos. Orden: `priority` antes que
  `consume_soon`, luego por antigüedad (`age_days` desc).
- `featured`: receta elegida (`candidates[0]`) con datos de pintado,
  `reasons: string[]` (traducidas de `reasonCodes`), `mode` y
  `missingIngredients`. `null` si no hay candidata segura.
- `alternatives[]`: resto de candidatas con datos de pintado (para `RecipeCard`).
- `shoppingMissing[]`: `{ ingredientId, name, quantity, unit }`.
- `mealType`, `decisionReason` (para estados vacíos).

## Layout de la Home (reorganización completa de `(tabs)/index.tsx`)

De arriba a abajo:

1. Cabecera: saludo + `HomeAskInput` (se conservan).
2. "Productos a consumir": fila de chips con estado 🔴/🟡, nombre y
   "caduca ~fecha". Cabecera con acción "VER DESPENSA" → `/alacena`. Se oculta
   si no hay prioritarios.
3. "Cocina esto hoy": tarjeta grande de la receta `featured`, con el porqué
   (de `reasons`) y badge `LISTA PARA COCINAR` / `TE FALTA N`.
4. "Otras ideas": fila de `alternatives` (reutiliza `RecipeCard`).
5. "Te falta para cocinar": `shoppingMissing` + botón "añadir a la compra"
   (reutiliza `addIngredientsToShopping`).

Estados especiales:

- Sin prioritarios: se omite la sección 2; la sección 3 se titula "Ideas para
  tu {franja}".
- `decisionReason` `no_safe_candidate` / `unsupported_household_restriction`:
  mensaje claro en lugar de tarjeta, sin featured.

Se conservan: pull-to-refresh, recarga en foco (`useFocusEffect`), generación
lazy de imágenes (`ensureRecipeImage`, PR #97) para featured/alternatives, y el
toggle de favorito.

## Componentes

Nuevos en `features/home/components/`: `priority-products-strip.tsx`,
`featured-recipe-card.tsx`, `shopping-missing-card.tsx`. Se reutilizan
`home-section-header.tsx`, `recipe-card.tsx`, `home-ask-input.tsx`. Se retiran
de la Home `home-suggestions.tsx`, `pantry-summary-card.tsx` y `quick-add-card.tsx`
en su rol actual (el resumen de despensa deja de vivir en la Home; su acceso
queda vía "VER DESPENSA").

## Entrega en 2 PRs (una feature por PR)

- PR A (backend): migración `household_today_decision` + tests pgTAP + DTO en
  `@recetas/shared`.
- PR B (móvil): wrapper en `lib`, `useHome` reescrito y componentes nuevos,
  consumiendo el DTO.

## Verificación

- PR A: `pnpm test:db` con pgTAP del nuevo DTO (prioritarios ordenados,
  faltantes agregados y deduplicados, `featured` = candidata #1, estados
  degenerados devuelven `featured: null`); `supabase db reset` aplica limpio.
- PR B: `pnpm lint`, `pnpm typecheck`; recorrido en móvil: con un producto
  próximo a caducar en la despensa, aparece en "Productos a consumir" y la
  receta que lo usa sale como "Cocina esto hoy".
