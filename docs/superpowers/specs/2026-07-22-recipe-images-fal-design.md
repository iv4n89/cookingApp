# Imágenes de receta con fal.ai + UX de carga — diseño

Fecha: 2026-07-22

## Problema

Las imágenes de receta casi nunca aparecen. El pipeline es correcto (16/45 recetas tienen
imagen, buckets públicos, `PUBLIC_SUPABASE_URL` OK), pero el proveedor —**Pollinations** con
flux— es inestable: para títulos nuevos su cola tarda 30-40s+ o falla, y con el timeout de 60s
la tarea de fondo muere en silencio y la receta se queda con placeholder. Además,
`image_url = null` no distingue "generándose" de "no habrá imagen", así que la UI no puede
mostrar un spinner con criterio.

## Objetivo

1. Cambiar a un proveedor rápido y fiable (**fal.ai Flux schnell**, de pago).
2. UX de carga: mientras se genera, spinner; si no habrá imagen, placeholder.
3. Acotar el coste: generar imagen (de pago) **solo para recetas reutilizables**.

## Decisiones tomadas

- **Proveedor:** fal.ai Flux schnell (~1-2s, ~0,003 $/imagen). Requiere `FAL_KEY`.
- **Solo reutilizables reciben imagen:** las del **chat** (`reusable=false`,
  exploratorias/personalizadas) **no** llaman a fal → placeholder. Solo las **reutilizables**
  (búsqueda cache-miss + sembradas) generan imagen. Esto mata el mayor driver de coste (el chat)
  y hace que sembrar catálogo con imágenes sí ahorre.
- **Señal:** columna `recipes.image_status` (`pending` | `ready` | `none`).
- **Alcance UI:** hero del detalle, tarjeta de chat **y** tarjetas de listas (Home/favoritos/
  historial) — spinner mientras `pending`, con sondeo.
- **Ingredientes fuera de alcance:** `generate-ingredient-images` sigue con Pollinations.

## Modelo (esquema)

Migración:
- `alter table recipes add column image_status text not null default 'pending'`.
  - `pending`: generándose (el cliente sondea).
  - `ready`: hay `image_url` servible.
  - `none`: no habrá imagen (variante de chat, o generación fallida tras reintentos) → placeholder.
- Backfill de las existentes: `ready` si `image_url is not null`, `none` si no.

## Proveedor (`supabase/functions/_shared/recipe-image.ts`)

- Sustituir `pollinationsUrl`/fetch por fal.ai Flux schnell:
  - `POST https://fal.run/fal-ai/flux/schnell`, header `Authorization: Key ${FAL_KEY}`
    (de `Deno.env`; si falta → marcar `none`).
  - Body: `{ prompt, image_size: 'landscape_4_3', num_inference_steps: 4, num_images: 1 }`.
  - Respuesta: `images[0].url` → descargar → bytes → `upload` al bucket `recipe-images`
    (igual que ahora) → `image_url` público.
  - Hasta 2 reintentos de la llamada a fal antes de rendirse.
- Resultado: éxito → `update recipes set image_url = <url>, image_status = 'ready'`; fallo →
  `update recipes set image_status = 'none'`.
- `queueRecipeImage` mantiene el segundo plano (`EdgeRuntime.waitUntil`).

## Pipeline (`_shared/recipes.ts` → `saveRecipe`)

- Al insertar la receta:
  - `reusable === true` → `image_status = 'pending'` y **encolar** la imagen (fal).
  - `reusable === false` (chat) → `image_status = 'none'` y **no** encolar (sin fal, placeholder).
- El job de imagen escribe `ready`/`none` al terminar (solo corre para reutilizables).

## Cliente

- `Recipe.image_status` en el tipo (`lib/recipes.ts`) y exponerlo en las queries/RPC que
  alimentan tarjetas: `getRecipe` (COLUMNS), `recommended_recipes` (returns table), favoritos e
  historial-detalle.
- **Hook `useRecipeImage(recipeId, url, status)`** (nuevo):
  - `url` presente → `{ url, state: 'ready' }`.
  - `status === 'pending'` → sondea `recipes.select('image_url, image_status').eq('id', …)` cada
    ~1,5s hasta `ready` (con url) o `none`; tope de seguridad ~20s. Devuelve `state`.
  - `none`/desconocido → `{ state: 'none' }`.
- Componentes (`RecipeHero`, `RecipeCard`, `ChatRecipeCard`): `ready` → `<Image>`; `pending` →
  spinner; `none` → placeholder actual. Las del chat entran directas como `none` → placeholder.

## Previsión de gastos y volumen de llamadas

### De dónde salen las llamadas (a fal.ai), tras la decisión

Solo **recetas reutilizables** generan imagen. `queueRecipeImage` se dispara una vez por
receta reutilizable guardada:
- **Búsqueda del Home** (cache-miss): reutilizable → 1 imagen. Los **cache-hits reutilizan** →
  0 imágenes.
- **Siembra del catálogo** (`index-recipe`): 1 imagen por receta sembrada (one-off).
- **Chat** (`reusable=false`, `skipCache`): **0 imágenes** (placeholder). Sigue costando solo el
  texto de Gemini.

Consecuencia: **el coste de imagen ya no escala con el uso del chat**, sino con el **crecimiento
del catálogo reutilizable**. Con un catálogo maduro y bien sembrado, la tasa de cache-hit de la
búsqueda es alta → pocos cache-miss → pocas imágenes nuevas. Es esencialmente un coste
**one-off por receta añadida al catálogo**, no recurrente por usuario.

### Coste unitario (aprox., verificar precio vigente de fal.ai)

- fal.ai Flux schnell: ~**0,003 $/imagen** (+ hasta 2 reintentos solo si falla).
- Almacenamiento: ~60 KB/imagen (despreciable frente a fal).

### Escenarios (coste NUEVO de fal.ai)

El coste ≈ nº de recetas reutilizables con imagen. Ejemplos:

| Catálogo reutilizable con imagen | Coste fal.ai (one-off) |
|---|---|
| 1.000 recetas | ~3 $ |
| 5.000 recetas | ~15 $ |
| 20.000 recetas | ~60 $ |

Más el goteo de cache-miss de la búsqueda (recetas nuevas que se añaden al catálogo con el uso).
Si se siembra bien el catálogo por adelantado, el cache-miss tiende a bajar con el tiempo. El
techo por usuario del rate-limit (10 gen/h) sigue aplicando, pero solo la fracción que sea
reutilizable-y-nueva cuesta imagen.

### Otras llamadas nuevas (no de pago)

- **Sondeo del cliente** (Supabase reads): cada imagen `pending` que se mira genera
  `recipes.select(image_url,image_status)` cada ~1,5s hasta resolverse (~1-2 lecturas típicas con
  fal, tope ~13). Como el chat entra como `none` y las listas casi nunca tienen `pending`, el
  sondeo real es muy bajo.

### Nota sobre coste de TEXTO (Gemini) — fuera de este spec

La decisión no cambia el coste de **texto** del chat (sigue generando con Gemini en cada intento).
Si el escenario "usuario explorando en el chat cada día" preocupa por el coste de Gemini, la
palanca sería que el chat reutilice caché o bajar el rate-limit — decisión aparte, no de este spec.

## Verificación

- Migración aplicada; `image_status` presente; backfill (`ready`/`none`).
- `deno check` de `_shared/recipe-image.ts` y `_shared/recipes.ts`.
- Con `FAL_KEY` válida: guardar una receta **reutilizable** → en pocos segundos `image_status`
  pasa a `ready` con `image_url` servible. Guardar una del **chat** (`reusable=false`) → queda
  `none` sin llamada a fal. Simular fallo (FAL_KEY inválida) en una reutilizable → `none`.
- Cliente (`tsc` + dev-client): receta recién generada reutilizable → hero con spinner y luego
  imagen; receta `none` → placeholder.

## Fuera de alcance

- Imágenes de ingredientes (`generate-ingredient-images`).
- Regenerar imágenes de recetas viejas marcadas `none`.
- Palancas de coste de **texto** (cachear chat, bajar rate-limit).
