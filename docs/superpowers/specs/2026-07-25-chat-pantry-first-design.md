# Chat catálogo-primero con ranking por despensa — Diseño

## Problema

El chat de recetas propone platos en los que al usuario le faltan muchos ingredientes.
Causas raíz (verificadas en código):

1. `chat/index.ts` llama a `resolveRecipe(..., { skipCache: true })` (línea 183), lo que
   **salta la búsqueda semántica** (`recipe-pipeline.ts:106-119`) y **genera siempre** una
   receta nueva con Gemini, ignorando el catálogo (~474 recetas indexadas).
2. El chat no usa el motor pantry-first (`household_recommendation_decision` /
   `evaluate_recommendation_snapshot`), que ya rankea por `missingIngredientCount` con canon
   y conversión de unidades. Ese motor solo está cableado a la Home.
3. La despensa llega a Gemini como texto suelto solo en la fase de intención; en la generación
   real solo se fuerza si el usuario dice explícitamente "con lo que tengo" (`pantry_only`).

## Objetivo

Cuando el usuario pide una receta, el chat devuelve la variante del catálogo **más cocinable con
su despensa** (menos ingredientes a comprar), reutilizando el motor pantry-first. Solo genera con
Gemini si no hay ninguna receta del catálogo que encaje con la petición. Las **modificaciones**
("sin huevo", "más picante", "adáptala") siguen generándose frescas.

## Decisiones de producto (confirmadas por el usuario)

- **Catálogo-primero + generar si no hay.**
- Al pedir un plato concreto con faltantes: **mostrar la mejor variante y decir qué falta** (no
  cambiar de plato).

## Arquitectura

### Pieza nueva de datos: RPC `household_recipe_ranking`

Rankea un conjunto arbitrario de recetas contra la despensa del hogar, reutilizando el evaluador
existente. Evita duplicar el SQL grande de `build_household_recommendation_snapshot`: construye el
snapshot completo y **filtra `recipeInputs`** al conjunto pedido antes de evaluar.

```sql
create function public.household_recipe_ranking(
  p_recipe_ids uuid[],
  p_meal_type text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_household_id uuid;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'no autenticado' using errcode = '42501';
  end if;
  v_household_id := public.current_household_id();
  if v_household_id is null then
    raise exception 'hogar no encontrado' using errcode = '42501';
  end if;
  perform public.require_household_member(v_household_id);
  if p_recipe_ids is null or cardinality(p_recipe_ids) = 0 then
    return public.evaluate_recommendation_snapshot(
      jsonb_build_object('recipeInputs', '[]'::jsonb, 'inventoryBatches', '[]'::jsonb), p_limit
    );
  end if;
  v_snapshot := public.build_household_recommendation_snapshot(
    v_household_id, v_user_id, statement_timestamp(), p_meal_type
  );
  v_snapshot := jsonb_set(v_snapshot, '{recipeInputs}', coalesce((
    select jsonb_agg(ri)
    from jsonb_array_elements(v_snapshot->'recipeInputs') ri
    where (ri->>'recipeId')::uuid = any(p_recipe_ids)
  ), '[]'::jsonb));
  return public.evaluate_recommendation_snapshot(v_snapshot, p_limit);
end;
$$;

revoke execute on function public.household_recipe_ranking(uuid[], text, integer) from public, anon;
grant execute on function public.household_recipe_ranking(uuid[], text, integer) to authenticated;
```

El resultado tiene la misma forma que `evaluate_recommendation_snapshot`: `candidates` ordenadas
pantry-first, cada una con `score.missingIngredientCount`, `mode` (`cook_now`/`shop_then_cook`) y
`missingIngredients` (lista con `name`).

### Flag `is_modification` en la intención del chat (`gemini.ts`)

Añadir al `CHAT_SCHEMA` y a `ChatResponse` un booleano `is_modification` (no `required`; default
tratado como `false`). Instrucción nueva en `BASE_PROMPT`: se marca `true` cuando el usuario pide
ADAPTAR o CAMBIAR una receta (quitar/añadir/sustituir un ingrediente, cambiar raciones, nivel de
picante, "hazla vegana", "sin X", "más ligera", "adáptala"); `false` cuando pide un plato "de
catálogo" sin modificaciones ("una receta de lasaña", "algo con pollo", "quiero un guiso").

### Nuevo resolutor del chat (`recipe-pipeline.ts`): `resolveRecipeForChat`

Función exportada nueva (no toca `resolveRecipe`, que usa la búsqueda del Home). Firma:

```ts
export async function resolveRecipeForChat(
  supabase: SupabaseClient,
  query: string,
  userId: string | null,
  prefs: UserPrefs | null,
  constraints: Constraints = {},
): Promise<{ recipe: Record<string, unknown> | null; origin: RecipeOrigin; missing: string[] }>
```

Flujo:

1. Calcular `exclude_allergens` / `require_diet` combinando preferencias + constraints (igual que
   `resolveRecipe`, líneas 97-104).
2. Embeder `query` (`embedText(query, 'RETRIEVAL_QUERY')`) y llamar a `match_recipes` con
   `match_count: 12`, `match_threshold: MATCH_THRESHOLD`, y los filtros de alérgenos/dieta.
3. Si hay coincidencias: `supabase.rpc('household_recipe_ranking', { p_recipe_ids: ids, p_limit: 12 })`
   con los ids de las coincidencias. Tomar `candidates[0]` (más cocinable). Recuperar la receta
   completa del array de `match_recipes` por su `recipeId`. Devolver
   `{ recipe, origin: 'db', missing: nombres de candidates[0].missingIngredients }`.
   - Si `match_recipes` trae filas pero el ranking devuelve `candidates` vacío (todo filtrado por
     seguridad/alérgenos) → seguir al paso 4 (generar).
4. Si no hay coincidencias (o ranking vacío): generar con Gemini (rama actual de `resolveRecipe`,
   líneas 121-162), con la despensa como **guía blanda** siempre que haya despensa (además de la
   restricción dura `pantryOnly`). Devolver `{ recipe: saved, origin, missing: [] }`.

`match_recipes` ya devuelve filas de receta completas (lo confirma `resolveRecipe`, que retorna
`match` como `recipe`), así que no hace falta un fetch extra.

### Cambios en `chat/index.ts`

- Importar `resolveRecipeForChat`.
- Leer `is_modification` de `generateChat(...)`.
- En el bloque `if (query)`:
  - Si `is_modification === true` → **generación fresca**: seguir usando
    `resolveRecipe(..., { skipCache: true })` (comportamiento actual; la modificación debe reflejar
    exactamente lo pedido y no existe en catálogo).
  - Si no → `resolveRecipeForChat(...)` (catálogo-primero). Pasar `pantry: pantryNames` en los
    constraints para la guía blanda del fallback de generación.
  - `pantry_only === true` sigue: si no hay despensa, `EMPTY_PANTRY_NOTE`; si la hay, la restricción
    dura se aplica en la generación (fallback).
- Cuando `origin === 'db'` y `missing.length > 0`, añadir al `message` una línea determinista:
  `Te faltarían: X, Y, Z.` (máx. 6 nombres). Si `missing.length === 0` y `origin === 'db'`, añadir
  `Puedes cocinarla ya con lo que tienes.`

El cliente móvil no cambia: la card ya pinta faltantes por ingrediente
(`chat-recipe-card.tsx`), y la receta devuelta es una fila de BD normal.

## Errores y casos borde

- **Ranking vacío / RPC error**: si la llamada al RPC falla, degradar a generación (no romper el
  chat). El evaluador nunca lanza por lista vacía (devuelve `candidates: []`).
- **Despensa vacía + petición normal**: `match_recipes` puede devolver coincidencias; el ranking las
  marca todas `shop_then_cook` con faltantes; se devuelve la de menos faltantes igualmente (mejor que
  generar). Correcto.
- **`is_modification` ausente**: tratar como `false` (catálogo-primero).
- **Rate limit**: solo aplica al fallback de generación (igual que hoy); catálogo-primero no consume
  cuota.

## Testing

- pgTAP `0011_household_recipe_ranking.test.sql`: reutiliza el patrón de fixtures de
  `0009_household_today_decision.test.sql` (hogar, despensa, recetas cook_now/shop_then_cook).
  Asserts: (a) existe la función y solo `authenticated` la ejecuta; (b) con un id `cook_now` y otro
  `shop_then_cook`, `candidates[0].recipeId` es el `cook_now` y su `missingIngredientCount` es 0;
  (c) filtra: pedir solo el id `shop_then_cook` devuelve una sola candidata con
  `missingIngredientCount > 0`; (d) lista vacía → `candidates: []`.
- Edge Functions: no hay suite automatizada; verificación manual en la demo (pull del chat) tras
  `functions deploy`.

## Despliegue

Backend-only: `supabase db push` (RPC) + `supabase functions deploy chat`. Entra en la APK de la
demo sin reinstalar.
