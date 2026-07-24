# Diseño: imágenes garantizadas en las recetas de Home

Fecha: 2026-07-24. Estado: aprobado.

## Problema

Las cards de la Home colapsan el hueco de imagen cuando la receta no tiene
`image_url`. El detalle ya genera la imagen on-demand (`ensure-recipe-image` +
sondeo en `useRecipeImage`), pero la Home nunca dispara la generación, así que
muchas recetas se muestran sin imagen.

## Decisión

Generación lazy: solo se genera la imagen de las recetas que llegan a
mostrarse en la Home. Sin backfill masivo (coste fal.ai) y sin cambios de
backend.

## Diseño

En `apps/mobile/src/features/home/hooks/use-home.ts`, tras recibir las
recomendaciones:

- Por cada receta con `image_url` nulo y `image_status !== 'pending'`, llamar a
  `ensureRecipeImage(id)` (fire-and-forget; la Edge Function es idempotente y
  encola en background).
- Registrar los ids ya solicitados en un `Set` en memoria para no repetir la
  llamada en cada refetch por foco.
- Marcar la receta localmente como `image_status: 'pending'` para que
  `RecipeCard` muestre el slot con spinner y su `useRecipeImage` sondee hasta
  obtener la url, igual que el hero del detalle.
- Si la generación falla (`none` tras reintentos), la card colapsa el hueco
  como hoy; en una sesión futura se reintenta.

Alternativas descartadas: disparar desde `RecipeCard`/`useRecipeImage`
(afectaría a favoritos e historial, fuera de alcance) y una función batch de
backend (piezas nuevas sin necesidad).

## Verificación

- `pnpm lint` y `pnpm typecheck`.
- Manual: abrir la Home con recetas sin imagen; las cards muestran spinner y
  la imagen aparece al terminar la generación; el pull-to-refresh no repite
  llamadas para ids ya solicitados.
