# Diseño: filtrar la pista pantry por franja horaria

Fecha: 2026-07-24. Estado: aprobado.

## Contexto

Tras el reordenado pantry-first (menos faltantes primero), `mealTypeMatch`
quedó como señal débil del motor, así que la Home destaca platos de la franja
equivocada (p. ej. "Huevos fritos con patatas" en el desayuno). La expectativa
de "ver recetas según el momento del día" se perdió en la práctica.

## Cambio

Migración `0058` (`create or replace` de `household_today_decision`, sin editar
0057): al construir la pista **`pantry`**, filtrar las candidatas por la franja
actual antes de tomar `featured` + `alternatives`.

- **Match**: una candidata entra si sus `meal_types` incluyen `p_meal_type`, o
  si la receta no tiene `meal_types` (sin clasificar → elegible en cualquier
  franja, para no excluir las recetas antiguas que no lo llevan). Con
  `p_meal_type` null no se filtra.
- **Fallback**: si tras filtrar no queda ninguna candidata, se usa la lista sin
  filtrar (la sección nunca queda vacía).
- **`discover` no cambia**: sigue variado, sin filtrar por franja.

El orden dentro de la franja sigue siendo pantry-first (menos faltantes).

## Alcance

Solo backend: migración `0058` + test pgTAP `0009`. Sin cambios en el móvil
(ya pasa la franja; la sección "Aprovecha tu despensa" ahora respeta el
momento). No fuerza el ingrediente crítico (pieza aparte).

## Verificación

pgTAP: con `p_meal_type='desayuno'` y candidatas que incluyan una receta de
desayuno y otra de solo cena, `pantry.featured` es la de desayuno; con una
franja sin ninguna coincidencia, el fallback devuelve pantry no vacío.
