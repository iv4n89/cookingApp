# RecetasApp — Arquitectura

App móvil de recetas con IA. Alacena auto-descontada, lista de compra, pasos con
temporizadores, y búsqueda/generación de recetas con atribución de fuente.
Suscripción: 2,99 €/mes o 29,99 €/año.

## Stack

| Capa      | Decisión                                                        |
|-----------|-----------------------------------------------------------------|
| Móvil     | Expo (React Native) + TypeScript + NativeWind                   |
| Datos/Auth| Supabase (Postgres + pgvector + Auth + storage)                 |
| Backend   | Supabase Edge Functions (Deno/TS): orquestación IA + webhook RC |
| IA        | MiniMax (generación de recetas + embeddings)                    |
| Pagos     | RevenueCat + IAP nativo (Apple/Google)                          |

No hay servidor propio: la lógica de servidor vive en Edge Functions (pago por
invocación, 0 € en reposo). La clave de MiniMax es un secreto de la función y
nunca llega al móvil.

## Monorepo

```
apps/
  mobile/          Expo app
supabase/
  functions/       Edge Functions (orquestación IA + webhooks)
  migrations/       Esquema DB (pgvector)
packages/
  shared/          Tipos de dominio y DTOs (app + funciones)
  theme/           Tokens de DESIGN.md → preset Tailwind/NativeWind
stitch/            Diseños de origen (DESIGN.md, html, img)
```

## Flujo de búsqueda de receta

1. Embedding de la consulta (MiniMax) → búsqueda vectorial en `recipes`.
2. Si la similitud supera el umbral → se reutiliza (sirve a cualquier usuario).
3. Si no → búsqueda web → generación con MiniMax.
4. La receta nueva se guarda con embedding + tags para reutilización futura.

El front nunca llama a MiniMax ni a la DB directamente; todo pasa por el backend.

## Pagos

Las suscripciones digitales en iOS/Android deben usar el IAP nativo. RevenueCat
envuelve el IAP y notifica al backend por webhook; el backend actualiza
`subscriptions`. El front consulta el estado de suscripción vía RevenueCat SDK.

## Pendiente de confirmar

- Dimensión del vector de embeddings de MiniMax (columna `recipes.embedding`).
