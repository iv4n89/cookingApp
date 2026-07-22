# Caché de alias del resolver del pipeline — diseño

Fecha: 2026-07-22

## Problema

El resolver de ingredientes al guardar recetas
(`supabase/functions/_shared/recipes.ts` → `withIngredientIds`, spec
`2026-07-22-pipeline-resolver-ingredientes-design.md`) llama a Gemini
(`resolveIngredients`) una vez por receta cuando algún nombre de ingrediente no casa exacto con
el catálogo. Esa llamada se repite cada vez que aparece el mismo nombre generado, aunque ya se
resolviera antes: coste y latencia innecesarios.

## Objetivo

Cachear las resoluciones nombre→ingrediente en una tabla persistente para no volver a llamar a
la IA con un nombre ya resuelto.

## Decisiones tomadas

- **Persistente** (tabla en BD), no caché en memoria del edge (que sería efímera por instancia).
- **Sin seed**: se acumula sola. No se siembra desde `mapping.json` porque esos nombres son del
  catálogo y ya casan por `normalized_name` exacto; la caché aporta valor solo con las frases
  del LLM que no están en el catálogo.
- **Global** (nivel catálogo, no por usuario). Escritura desde el pipeline (servidor).

## Modelo (esquema)

Nueva migración con la tabla:

```sql
create table ingredient_aliases (
  normalized_alias text primary key,
  ingredient_id uuid not null references ingredients (id) on delete cascade,
  created_at timestamptz not null default now()
);
```

- `normalized_alias`: el nombre de ingrediente generado por el LLM, normalizado con la misma
  `normalizeName` que usa `withIngredientIds` (minúsculas, sin acentos, espacios colapsados).
- `ingredient_id`: la entrada del catálogo a la que resolvió (canónica o variante; el match por
  canónico de la RPC/cliente hace el resto). `on delete cascade`: si se borra la entrada, su
  alias desaparece.
- RLS/grants: es catálogo (no datos de usuario). Lectura para `authenticated` + `service_role`;
  escritura para `service_role` (el pipeline corre con service role). Se habilita RLS con una
  policy de select para autenticados, como `ingredients`.

## Flujo en `withIngredientIds`

Orden de resolución (los pasos 1 y 4 ya existen; se intercalan 2 y 5):

1. **Match exacto** por `normalized_name` del catálogo completo (como ahora).
2. **Caché de alias (nuevo):** para los nombres no resueltos en (1),
   `select normalized_alias, ingredient_id from ingredient_aliases where normalized_alias in (...)`;
   resolver los que aparezcan.
3. **Fast-path:** si tras (1)+(2) están todos resueltos → **no se llama a la IA** y se devuelve.
4. **IA:** solo los nombres que siguen sin resolver van a `resolveIngredients` (con el vocabulario
   canónico), se crean los nuevos canónicos bien categorizados y se resuelven (como ahora).
5. **Escribir alias (nuevo):** tras la IA, `upsert` en `ingredient_aliases` de los pares
   `normalized(input) → ingredient_id` recién resueltos por IA (los ya resueltos por exacto o
   caché no hace falta reescribirlos). `onConflict: normalized_alias, ignoreDuplicates` para ser
   idempotente y no pisar una resolución previa.

## Robustez

- Fallo al **leer** aliases: se ignora (se sigue con el flujo; peor caso, llamada IA como hoy).
- Fallo al **escribir** aliases: se ignora (no bloquea el guardado; solo no se cachea esta vez).
- El fallback actual ante fallo de `resolveIngredients` (match exacto + resto sin enlazar, nunca
  'Otros') se mantiene intacto.

## Fuera de alcance

- No toca el cliente ni la RPC `recommended_recipes` (usan `canonical_id`, no los alias por
  nombre).
- No cambia el prompt de `resolveIngredients`.
- No siembra la tabla.

## Verificación

- `deno check` de `_shared/recipes.ts`.
- Guardar una receta (vía `saveRecipe`) con un ingrediente cuyo nombre no esté en el catálogo:
  1ª vez llama a la IA y deja una fila en `ingredient_aliases`.
- Guardar otra receta con **ese mismo nombre** y comprobar que resuelve el `ingredient_id` sin
  crear entradas nuevas y sin necesidad de la IA (verificable porque el alias ya existe; se puede
  instrumentar temporalmente o comprobar que, con `GEMINI_API_KEY` inválida, el nombre cacheado
  aún resuelve mientras que uno nuevo cae al fallback).
