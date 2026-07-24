# Diseño: la destacada aprovecha el ingrediente crítico

Fecha: 2026-07-24. Estado: aprobado.

## Contexto

Con un producto a punto de caducar (cerdo `priority`), "Cocina esto hoy"
destaca un plato de 0 faltantes que no lo usa ("Huevos fritos con patatas"),
mientras la receta que aprovecha el cerdo ("Cerdo con patatas", 2 faltantes)
queda enterrada. El orden pantry-first (menos faltantes) ignora el
aprovechamiento de lo crítico. Además, la pimienta cuenta como faltante porque
no está en los básicos asumidos, inflando el conteo.

## A. Básicos: incluir la pimienta (motor)

Migración `0059` (`create or replace` de `evaluate_recommendation_snapshot`,
no edita 0053): añadir a la lista de básicos asumidos —los que no cuentan como
faltantes— los nombres canónicos `pimienta negra`, `pimienta de sichuan` y
`sal y pimienta`. La sal y los aceites de oliva/girasol ya estaban. Subir la
versión a `assumed-basics-es-v2`.

## B. Destacada que aprovecha lo crítico (composición)

Migración `0060` (`create or replace` de `household_today_decision`, no edita
0058): al elegir `pantry.featured`, dentro de las candidatas de la franja (ya
filtradas por 0058):

- Si existe alguna con `priorityUsage > 0` (usa un lote `priority`/`consume_soon`)
  **y** `missingIngredientCount ≤ 2`, se destaca esa: la de menos faltantes
  entre ellas, desempate por mayor `priorityUsage`, luego por rango.
- Si no, se destaca la primera por menos faltantes (comportamiento actual).

`pantry.alternatives` = el resto de la pista pantry por rango (excluida la
destacada). `discover` sigue igual (excluye los recipeId de pantry). El resto
del DTO no cambia.

## Alcance

Solo backend: `0059` + `0060` + tests `0008` (básico pimienta) y `0009` (regla
de destacada crítica). Sin cambios en el móvil ni en el DTO.

## Verificación

- `0008`: una receta cuyo único ingrediente "no básico" es pimienta pasa a
  tener 0 faltantes (antes 1).
- `0009`: con un lote crítico y dos candidatas de la franja —una que lo usa con
  ≤2 faltantes y otra de 0 faltantes que no lo usa— `pantry.featured` es la que
  aprovecha lo crítico. Si la crítica tiene >2 faltantes, gana la de 0.
- Manual: con el cerdo `priority`, la destacada de la cena pasa a "Cerdo con
  patatas".
