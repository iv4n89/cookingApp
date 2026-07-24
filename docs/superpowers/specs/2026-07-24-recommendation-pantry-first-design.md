# Diseño: recomendación que prioriza la despensa + descubrimiento

Fecha: 2026-07-24. Estado: aprobado.

## Contexto

La Home empujaba a comprar: destacaba recetas `shop_then_cook` con muchos
faltantes, porque el motor rankea `cook_now` primero y luego por uso de
prioritarios, dejando el nº de faltantes casi al final. Con el catálogo actual
(339 recetas reutilizables, media 7,5 ingredientes) eso hace que una receta de
6 faltantes pueda destacarse sobre una de 2.

Objetivo: sin tocar todavía el catálogo (pieza aparte), exprimir lo que hay —
priorizar el aprovechamiento de la despensa y separar el descubrimiento. La
mejora es de orden y presentación; seguirá habiendo faltantes hasta ampliar el
catálogo.

Decisiones de producto ya tomadas:
- Si un producto crítico no tiene receta con ≤2 faltantes, NO se fuerza: se
  destaca la receta que mejor aprovecha la despensa; el crítico sigue en
  "Productos a consumir".
- Descubrimiento = recetas variadas, en su mayoría casi cocinables.

## 1. Motor `household_recommendation_decision`

Dos cambios:

- **Reordenar** las candidatas para que el nº de faltantes sea el criterio
  principal. Orden nuevo (reemplaza el actual en `0053`, bloque `jsonb_agg ...
  order by`): `missingIngredientCount` asc → `priorityUsage` desc →
  `consumeSoonUsage` desc → `seasonalAffinity` desc → `mealTypeMatch` desc →
  `availabilityRatio` desc → `recipeId`. Se elimina el `(mode = 'cook_now')
  desc` porque `missing = 0` equivale a `cook_now`, así que "cocinable ya"
  queda arriba igualmente. Entre empates de faltantes gana quien aprovecha lo
  crítico.
- **Subir el tope** de `p_alternative_limit`: de `least(..., 10)` a
  `least(..., 40)`, para que `household_today_decision` pueda pedir un conjunto
  mayor de candidatas seguras del que separar despensa y descubrimiento. No
  cambia el comportamiento por defecto (el default sigue en 5).

Se actualizan los contratos pgTAP de `0008` que fijan el orden.

## 2. DTO `household_today_decision`

Pide al motor ~30 candidatas (todas ya filtradas por seguridad: alérgenos y
dieta del hogar) y las reparte en dos pistas, sin duplicar la lógica de
seguridad del motor:

- **`pantry`** (aprovecha tu despensa): las candidatas con menos faltantes.
  `featured` = la primera; `alternatives` = las siguientes (hasta 4). Cada
  tarjeta lleva `missingIngredientCount` para mostrarlo con honestidad.
- **`discover`** (descubre): del resto de candidatas (las de más faltantes, en
  su mayoría "casi cocinables"), selección variada por cocina — recorrido
  determinista que va tomando recetas cuyo primer `tag` aún no ha aparecido,
  hasta 5, excluyendo las que ya están en `pantry`.

DTO nuevo:
`{ policyVersion, mealType, decisionReason, priorityProducts,
   pantry: { featured: TodayRecipeCard | null, alternatives: TodayRecipeCard[] },
   discover: TodayRecipeCard[] }`.

`shoppingMissing` se elimina del DTO (ya no se usa en la Home).

## 3. Home móvil

De arriba a abajo:
1. **Productos a consumir** (tira 🔴🟡, se mantiene).
2. **Aprovecha tu despensa**: `pantry.featured` (tarjeta grande) +
   `pantry.alternatives` (`RecipeCard`).
3. **Descubre**: `discover` (`RecipeCard`).

`useHome` consume el DTO nuevo. Se conservan pull-to-refresh, recarga en foco,
generación lazy de imágenes (para featured + alternatives + discover) y el
toggle de favorito.

Estados: sin `pantry.featured` → mensaje según `decisionReason` (como hoy);
`discover` vacío → se oculta la sección.

## Entrega en 3 PRs

- **A (motor)**: reordenar + subir tope en `0053` (regenerado o migración de
  reemplazo según el patrón del repo) + actualizar `0008`.
- **B (DTO today)**: `household_today_decision` con `pantry`/`discover` + DTO en
  `@recetas/shared` + pgTAP `0009` ampliado.
- **C (móvil)**: `useHome` y la Home con las dos secciones.

## Verificación

- A: `pnpm test:db` con el nuevo orden (una receta de 2 faltantes por encima de
  una de 6; entre iguales, la que usa prioritarios primero).
- B: pgTAP que `pantry` trae las de menos faltantes, `discover` es variada
  (tags distintos), segura (respeta alérgenos/dieta, heredado del motor) y sin
  solapar con `pantry`.
- C: `pnpm lint`/`typecheck`; en móvil, con un crítico dentro de plazo, arriba
  las de mayor aprovechamiento y abajo variedad.

## No incluye (piezas aparte)

Ampliar/reequilibrar el catálogo (pieza 1) y la personalización por gustos
(pieza 4). Este diseño ordena y separa mejor lo existente, no crea recetas.
