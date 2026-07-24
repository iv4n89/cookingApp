# Diseño: modificación de recetas por IA desde el detalle

Fecha: 2026-07-24. Estado: aprobado.

## Problema

Para pedir cambios sobre una receta ("no tengo nata, ¿sustituto?") hay que
salir del detalle e ir al chat. La modificación debe pedirse y verse sin
abandonar la pantalla de detalle.

## Decisión

Mini-chat en un modal con fondo difuminado sobre el detalle. Cada respuesta de
la IA que traiga receta se auto-aplica al detalle visible tras el blur; el
usuario puede refinar en más turnos y, al cerrar, se queda la última versión.
La explicación de la IA vive como burbuja del modal (sin banners aparte).

## Diseño

Sin cambios de backend: se usa la Edge Function `chat` tal cual. El contexto
se siembra con un mensaje `assistant` que lleva la receta actual (el backend
construye el contexto de adaptación desde mensajes assistant con `recipe` y
devuelve una receta nueva `reusable=false`).

Piezas en `apps/mobile/src/features/recipe-detail/`:

- `components/recipe-ai-bar.tsx`: botón anclado abajo a la izquierda (junto al
  FAB de cocinar) que abre el modal.
- `components/recipe-ai-modal.tsx`: modal con `BlurView` (patrón de
  `ask-ai-modal`), lista de burbujas usuario/asistente, indicador de espera e
  input con envío. Mantiene el historial mientras la pantalla esté montada.
- `hooks/use-recipe-detail.ts`: nueva acción `applyRecipe(recipe)` que
  sustituye la receta en el estado y re-basa las raciones. El resto (meta por
  usuario, cocinado, hero) reacciona al nuevo id; el hero genera la imagen
  on-demand como siempre. No se toca la url de la ruta.
- `app/receta/[id].tsx`: cablea barra + modal cuando hay receta.

Limitación heredada: máximo 10 generaciones/hora por usuario; el error se
muestra dentro del modal.

## Verificación

- `pnpm lint` y `pnpm typecheck`.
- Manual: en el detalle, pedir "sin nata" → spinner en el modal → el detalle
  muestra la receta modificada; refinar con un segundo turno; cerrar y
  comprobar que favoritos/cocinar operan sobre la receta nueva.
