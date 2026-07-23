# Lenguaje de dominio

## Household

El grupo familiar que posee una única despensa y una única lista de la compra.
Un hogar puede tener varios miembros, pero cada usuario pertenece exactamente
a un hogar mediante una membresía.

## Pantry

La proyección actual de existencias de un hogar. No es el historial: se deriva de lotes y eventos de inventario.

## PantryBatch

Una cantidad concreta de un ingrediente, adquirida o registrada en un momento, con unidad, procedencia y datos de caducidad estimada.

## InventoryEvent

Un hecho inmutable que modifica el inventario: compra, consumo, ajuste, desperdicio o restauración. Los eventos permiten explicar y reconstruir la despensa.

## ShoppingList

La lista única y compartida de un hogar. Completar una compra crea eventos de inventario; marcar un ítem no es una actualización aislada del cliente.

## RecommendationDecision

El resultado reproducible del motor de recomendación para una foto de estado: candidatos, puntuaciones, razones y versión de la política aplicada.

## Conversation

La interacción de lenguaje natural que interpreta una intención y explica una decisión. No decide el ranking ni es fuente de verdad del inventario.
