# Limpiar el picker: reclasificar 'Otros' — diseño

Fecha: 2026-07-22

## Problema

El catálogo de ingredientes tiene **111 entradas en la categoría 'Otros'** (genéricos que
creaba el pipeline antes del PR #71). El picker de ingredientes (`components/ingredient-picker.tsx`)
agrupa por categoría en un acordeón, así que muestra un cajón de sastre 'Otros' con esos 111,
desordenado. La generación ya no crea 'Otros' (PR #71 resuelve al catálogo canónico), pero los
111 existentes siguen ahí.

## Objetivo

Que los 111 'Otros' pasen a su **categoría controlada** para que el picker quede ordenado y el
grupo 'Otros' desaparezca. **El picker sigue mostrando todo** (canónicos y variantes): el
usuario quiere poder elegir la variante exacta que tiene en la despensa (cebolla blanca vs
morada). No se ocultan variantes ni se re-cura qué entrada es canónica.

## Alcance de este spec

Reclasificación de datos (dos scripts one-off, mismo patrón que el mapeo canónico). **Sin
migración de esquema y sin cambios de código de cliente** — el picker agrupa por categoría, así
que al vaciarse 'Otros' los ingredientes aparecen bajo su categoría sin tocar el componente.

## Reparto (medido)

De las 111 entradas 'Otros':
- **32** son su propio canónico (`canonical_id is null`): no tienen categoría de quien heredar
  → se clasifican con IA.
- **79** son variantes (`canonical_id is not null`):
  - 70 cuyo canónico ya es de categoría controlada → heredan directo.
  - 9 cuyo canónico es uno de los 32 'Otros' canónicos → heredan tras clasificar el canónico
    (cascada).

## Decisiones tomadas

- **Enfoque:** híbrido — heredar la categoría del canónico donde exista; IA para los 32 'Otros'
  canónicos.
- **Mapeo:** fichero JSON versionado y revisable antes de aplicar (como el mapeo canónico).
- **Solo datos:** scripts, sin migración ni cambios de cliente.

## Componentes

### 1. `scripts/reclassify-otros/build-categories.mjs`

- Lee los ingredientes con `category = 'Otros'` **y** `canonical_id is null` (los 32 canónicos).
- Con Gemini (rate-limited: pausa + reintento en 429, igual que `backfill-meal-types.mjs`),
  clasifica cada uno en una de las categorías controladas (`CATALOG_CATEGORIES`), pasándole el
  set como vocabulario cerrado. Nunca 'Otros'.
- Escribe `scripts/reclassify-otros/categories.json`: `[{ id, name, category }]`.
- El usuario revisa/ajusta el JSON.

### 2. `scripts/reclassify-otros/apply-categories.mjs`

Aplica en cascada (idempotente):
- a) Para cada entrada del JSON revisado, si `category` está en el set controlado, setear
  `ingredients.category` de ese id. (Valida contra el set; si una categoría no es válida, se
  omite y se avisa, para no meter basura.)
- b) Releer los 'Otros' variantes restantes (`category = 'Otros'` y `canonical_id is not null`)
  y setear su `category` = categoría de su canónico (que tras (a) ya es controlada). Cubre los
  70 directos y los 9 dependientes.
- Reporta cuántos quedaron en 'Otros' (debe ser 0).

### Categorías controladas

Las 12 del seed (ya expuestas como `CATALOG_CATEGORIES` en
`supabase/functions/_shared/preferences.ts`): `Aceites, vinagres y salsas`, `Carnes`,
`Cereales, pan y pasta`, `Condimentos y edulcorantes`, `Conservas y otros`,
`Especias y hierbas`, `Frutas`, `Frutos secos y semillas`, `Lácteos y huevos`, `Legumbres`,
`Pescados y mariscos`, `Verduras y hortalizas`. Los scripts (Node) llevan su propia copia de
la lista (no comparten módulo con las Edge Functions/Deno).

## Despliegue

Como los demás backfills: para producción se corren los dos scripts contra la BD de producción
(service role + `GEMINI_API_KEY`). `categories.json` queda versionado para reproducibilidad.

## Verificación

- `select count(*) from ingredients where category = 'Otros'` → **0**.
- Repartos por categoría coherentes (p.ej. "Cebolla" pasa a `Verduras y hortalizas`,
  "Leche de coco" a una categoría controlada).
- En el dev-client, el picker ya no muestra el grupo 'Otros'; los ingredientes aparecen bajo su
  categoría.

## Fuera de alcance

- No se oculta ninguna variante (el picker sigue mostrando todo).
- No se toca `ingredient-picker.tsx` ni `listIngredients`.
- No se re-cura qué entrada es el canónico de cada grupo.
- No se borran entradas del catálogo.
