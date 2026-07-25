# Personalización por gustos — Diseño

## Objetivo

Recomendar recetas del estilo que le gusta al hogar, usando favoritos y valoraciones altas como
señal, sin romper el pantry-first ni la variedad ya entregados. Aplica en tres sitios: carrusel
"Para ti" (Home), desempate suave en el chat y lean por gusto en el bloque descubrimiento de la Home.

## Decisiones de producto (confirmadas)

- **Señal**: recetas que cualquier miembro del hogar marcó favorita (`is_favorite`) o valoró ≥4
  (`user_recipes`). Agregado del hogar (la Home y la despensa ya son por hogar).
- **Dónde**: carrusel "Para ti" (Home) + desempate en chat + lean en descubrimiento (Home).
- **Fuerza**: el gusto nunca por encima del pantry-first. En descubrimiento se concilia con la
  variedad (azar ponderado). El pantry (destacada + alternativas) no cambia.

## Primitivo: afinidad de gusto

`tasteAffinity(receta) = máx sobre las semillas L de (1 - (receta.embedding <=> L.embedding))`,
donde las **semillas** son las recetas gustadas por el hogar (con `embedding not null`). Rango
~0..1. El máximo (no el promedio) respeta gustos diversos: cada semilla atrae a las suyas.

Semillas del hogar:
```sql
select distinct r.id, r.embedding
from public.user_recipes ur
join public.household_members hm on hm.user_id = ur.user_id
join public.recipes r on r.id = ur.recipe_id
where hm.household_id = :hh and (ur.is_favorite or ur.rating >= 4) and r.embedding is not null
```
**Cold start** (sin semillas): `tasteAffinity = 0` para todo; el carrusel se oculta; descubrimiento
y chat quedan igual que hoy. No rompe nada.

`recipes.embedding` es `vector(768)` con índice ivfflat coseno (migr 0004).

## Piezas

### 1. `tasteAffinity` en el motor (backend, sin rebuild)

**`build_household_recommendation_snapshot`** (nueva migración, reemplazo): añade a cada
`recipeInput` el campo `tasteAffinity` (máx coseno contra las semillas del hogar; 0 si no hay
semillas o la receta no tiene embedding). Se calcula con un `left join lateral` contra las semillas.

**`evaluate_recommendation_snapshot`** (misma migración, reemplazo): copia `tasteAffinity` a
`candidate.score.tasteAffinity` y lo añade al `ORDER BY` como desempate **bajo**, después de
`availabilityRatio` y antes de `recipeId`:
```
order by missingIngredientCount asc, priorityUsage desc, consumeSoonUsage desc,
         seasonalAffinity desc, mealTypeMatch desc, availabilityRatio desc,
         tasteAffinity desc, recipeId
```
Efecto inmediato: el **chat** (que rankea vía `household_recipe_ranking` → `evaluate` y toma
`candidates[0]` sin barajar) prefiere, entre recetas igual de cocinables, las del estilo del hogar.
La Home motor también expone `tasteAffinity`, que consume la pieza 3.

Ambas funciones conservan su firma y el resto del DTO. `evaluate` sigue `immutable`;
`build` no accede a `now()` para el afinidad (solo lee embeddings), así que sigue determinista.

### 2. Carrusel "Para ti" (Home) — RPC + móvil

**RPC `household_taste_recommendations(p_limit integer default 12)`** (nueva migración):
`stable`, `security definer`, `set search_path=''`, granted a `authenticated` (la llama el móvil
directo con el JWT del usuario, patrón de `household_today_decision`). Deriva hogar de `auth.uid()`
+ `current_household_id()`.

Lógica:
1. Semillas del hogar (query de arriba). Si no hay → devuelve `'[]'::jsonb`.
2. Alérgenos a excluir del hogar: `special_needs` de los miembros → `need_allergen_map` (mismo
   mapa que `recommended_recipes`, migr 0033). Dietas requeridas: `food_prefs` → `pref_diet_map`.
3. Candidatas = `recipes` con `reusable`, `embedding not null`, no semillas, que pasan el filtro de
   alérgenos/dieta a nivel de columna (`not (r.allergens && v_exclude)` y `r.diet @> v_require`),
   igual que `match_recipes`.
4. Rankear por `tasteAffinity` desc (máx coseno contra semillas), `limit p_limit`. Devolver un array
   de "cards" con la misma forma que las de `household_today_decision`
   (`recipeId, title, imageUrl, imageStatus, mode, missingIngredientCount, reasons`), con
   `mode`/`missingIngredientCount`/`reasons` neutros (no se cruza despensa aquí; el carrusel es
   descubrimiento por estilo). `missingIngredientCount` se puede omitir o poner null; el móvil no lo
   pinta en este carrusel.

**Móvil**: nueva sección "Para ti" en la Home con un carrusel horizontal, entre el bloque de
descubrimiento y el resto (posición exacta en el plan). Nuevo hook/consulta que llama a la RPC; si
devuelve `[]`, la sección no se renderiza. Reutiliza el componente de card existente. Requiere
**rebuild de APK** (cambio de cliente).

### 3. Descubrimiento de la Home con lean por gusto (backend, sin rebuild)

**`household_today_decision`** (nueva migración, v6): el bloque `discover` hoy elige una por cocina
con `order by r.tags[1], random()` y luego `order by random() limit 5` (variedad). Se cambia a
**azar ponderado por gusto** leyendo `tasteAffinity` de `candidate.score` (ya disponible por la
pieza 1):
```
order by (0.5 * coalesce((candidate->'score'->>'tasteAffinity')::numeric, 0) + 0.5 * random()) desc
```
tanto en el `distinct on` por cocina como en el `limit 5` final. Así descubrimiento tira hacia el
estilo del hogar pero sigue variando entre cargas. Con cold start (`tasteAffinity` 0) queda azar
puro = comportamiento actual.

El bloque **pantry** (destacada + alternativas) no se toca: sigue pantry-first + variedad.

## Componentes y límites

- El primitivo de afinidad vive en SQL (embeddings en Postgres). Ni el móvil ni las Edge Functions
  calculan similitud.
- Piezas 1 y 3 son backend-only → entran con `db push` sin reinstalar la APK. La pieza 2 (RPC) es
  backend, pero su carrusel en el móvil necesita rebuild.
- Sin dependencias nuevas. Reutiliza `need_allergen_map`/`pref_diet_map`, `recipes.embedding`, el
  índice coseno y el DTO de cards existente.

## Errores y casos borde

- Sin semillas (cold start): carrusel oculto, afinidad 0, todo igual que hoy.
- Recetas sin embedding: no son semillas ni candidatas del carrusel; su `tasteAffinity` es 0.
- Semillas no reusables (p. ej. generadas por el chat, `reusable=false`): valen como semilla (su
  embedding cuenta), pero no aparecen como candidatas del carrusel (que exige `reusable`).
- Seguridad: el carrusel filtra alérgenos/dieta a nivel de columna (mismo bar que `match_recipes`);
  el desempate del motor no relaja la seguridad por ingrediente que ya aplica `evaluate`.

## Testing

- pgTAP `household_taste_recommendations`: (a) existe y solo `authenticated` la ejecuta; (b) con una
  semilla favorita, una receta muy parecida sale por delante de una muy distinta; (c) las semillas no
  aparecen entre las candidatas; (d) una receta con alérgeno vetado por el hogar se excluye;
  (e) cold start → `[]`.
- pgTAP `evaluate_recommendation_snapshot`: con dos candidatas empatadas en todo salvo gusto, gana la
  de mayor `tasteAffinity` (semilla parecida en el snapshot).
- `household_today_decision`: verificar que `discover` sigue no vacío y sin solape (los invariantes de
  0009 no deben romperse); el lean por gusto es azar ponderado, no se testea el orden exacto.
- Edge Functions: sin suite; el chat hereda el desempate vía `evaluate` (cubierto por pgTAP del motor).

## Plan de entrega (slices)

- **PR A (backend, sin rebuild)**: piezas 1 + 3 + RPC de la pieza 2 + pgTAP. `db push` → chat y
  descubrimiento personalizan al momento; la RPC del carrusel queda lista.
- **PR B (móvil, rebuild)**: sección "Para ti" en la Home. Entra con la próxima APK.
