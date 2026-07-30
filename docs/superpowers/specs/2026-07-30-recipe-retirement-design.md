# Retirar recetas del catálogo sin borrarlas

Fecha: 2026-07-30
Estado: diseño aprobado en conversación, pendiente de ejecutar
Fase: B, segundo slice. Diseño de la fase completa en
`docs/superpowers/specs/2026-07-29-variedad-y-contenido-design.md`.
Slice anterior: `docs/superpowers/specs/2026-07-30-ingredient-coverage-design.md`.

## Problema

No hay forma de sacar una receta del catálogo. Si una receta está duplicada, es
incoherente ("carne con patatas fritas") o tiene una foto que no corresponde al plato, la
única salida es borrarla, y borrar rompe lo que cuelga de ella: `user_recipes` (favoritos y
valoraciones) y `cooked_recipes` tienen clave ajena contra `recipes`, así que borrar le
quita a alguien una receta que había guardado o cocinado.

Por eso los duplicados por título llevan semanas aplazados. Medición del 30 de julio contra
producción: **50 títulos repetidos, 111 recetas implicadas, 61 sobrantes**. La spec de la
fase B hablaba de 52; ese número era del 24 de julio y el catálogo creció desde entonces.

Y el problema es mayor que los duplicados: el slice siguiente genera cientos de recetas.
Sin forma de retirar las malas, cada error de generación se queda en el catálogo para
siempre.

## Alcance

El mecanismo de retirada, el filtro en todas las superficies que leen el catálogo, y la
limpieza de los 61 duplicados sobrantes. No incluye interfaz para retirar: eso es el panel
de la fase D. Por ahora se retira con SQL.

## Modelo

Dos columnas en `recipes`:

| Columna | Tipo | Significado |
| --- | --- | --- |
| `retired_at` | `timestamptz` | Cuándo se retiró. Nulo = publicada |
| `retired_reason` | `text` | Por qué: `duplicate`, `incoherent`, `bad_image` |

Restricciones:
- `check (retired_reason in ('duplicate', 'incoherent', 'bad_image'))` — vocabulario
  cerrado, como `recipes.source` (`0001_init.sql:19`) y
  `recipe_season_profiles.confidence` (`0052_recipe_season_profiles.sql:27`).
- `check ((retired_at is null) = (retired_reason is null))` — retirar sin decir por qué no
  se puede, y una receta publicada no arrastra un motivo viejo.

**Sin columna `status`.** Sería redundante con `retired_at` y permitiría el estado
incoherente `status = 'published'` con `retired_at` no nulo. El estado es una consecuencia
de la fecha, no un dato aparte.

**El motivo es obligatorio** porque en un mes nadie va a recordar por qué se retiraron 61
recetas de golpe, y porque el panel de la fase D necesita poder revisar la decisión.

## Dónde se filtra

`retired_at is null` en las cinco superficies que eligen recetas del catálogo:

| Superficie | Función o archivo | Qué alimenta |
| --- | --- | --- |
| Motor de recomendación | `build_household_recommendation_snapshot` (`0074`) | Home, `household_today_decision` y el ranking del chat |
| Búsqueda semántica | `match_recipes` (`0016`) | El chat, que busca candidatas del catálogo antes de generar |
| Carrusel por gustos | `household_taste_recommendations` (`0066`) | "Para ti" en la Home |
| Descubridor | `discover_recipes_by_ingredients` (`0068`) | La pantalla de descubrir por ingredientes |
| Recetario | `apps/mobile/src/lib/recipes.ts:116` | El catálogo de la pestaña Recetas |

`household_recipe_ranking` (`0064`) no se toca: reutiliza
`build_household_recommendation_snapshot`, así que hereda el filtro. Es la razón por la que
el chat y la Home se arreglan con un solo cambio.

Además, la vista `ingredient_recipe_coverage` (`0076`) deja de contar las retiradas. Si no,
la cobertura seguiría contando las 61 duplicadas y mediríamos el avance de la fase B con una
regla falsa: retirar un duplicado no añade cobertura, y dejarlo contando la restaría de
forma invisible.

## Dónde no se filtra, a propósito

- **`find_similar_recipe` (`0034`)**, el dedup de la generación. Tiene que seguir viendo las
  retiradas: si no, el generador volvería a crear la receta que acabamos de retirar por
  duplicada, y la limpieza se desharía sola en la primera tanda del slice siguiente.
- **La lectura por id** (`apps/mobile/src/lib/recipes.ts:154`) y las guardadas. Quien tenía
  la receta guardada o marcada como favorita la conserva y la puede abrir. Retirar la saca
  del catálogo y de las recomendaciones; no le quita nada a nadie.
- **`recommended_recipes`** (última versión en `0040`). Está muerta: no la llama el móvil ni
  ninguna Edge Function, solo la menciona un comentario en
  `supabase/functions/_shared/preferences.ts:38`. No se toca. Queda anotada como deuda: es
  una función concedida a `authenticated` que ya no sirve a nadie.

## Limpieza de los duplicados

Por título exacto entre las reusables, se queda una y las demás se retiran con
`retired_reason = 'duplicate'`.

Criterio de la que se queda, en orden:

1. **La que alguien tenga guardada o valorada** (`user_recipes`). Si una copia es favorita
   de alguien, quedarse con esa evita que su receta guardada quede fuera del catálogo.
2. **La que tenga `image_status = 'ready'`.** Una receta sin foto se ve peor en la Home.
3. **La más antigua** por `created_at`.
4. **El id menor**, para que el resultado sea reproducible y no dependa del orden físico de
   las filas.

Son 50 títulos y 61 retiradas.

La limpieza no va como `update` suelto en la migración, sino como función
`retire_duplicate_recipes()` que la migración invoca y que devuelve cuántas retiró. Dos
razones: un `update` que corre una vez dentro de una migración no se puede probar —la base
local no tiene ni una receta, así que no habría nada que limpiar al ejecutar los tests—, y
el slice siguiente genera cientos de recetas, que traerán duplicados nuevos. La función es
la herramienta que hará falta entonces, no una abstracción anticipada.

Solo la puede ejecutar `service_role`: retirar recetas del catálogo no es algo que haga el
móvil.

El título se compara **tal cual**, sin normalizar mayúsculas ni acentos: es como se midieron
los 50 títulos y evita agrupar platos que solo coinciden al normalizar. La consulta mira
solo recetas publicadas, así que volver a ejecutarla no retira nada más: si un título ya
tiene una sola publicada, deja de estar duplicado.

**Solo títulos exactos.** Los casi-duplicados por embedding quedan fuera: el riesgo de
retirar dos platos que solo se parecen de nombre no compensa, y no hay quién revise el
resultado hasta que exista el panel.

## Criterio de aceptación

Una receta retirada no aparece en la Home, ni en el chat, ni en el descubridor, ni en el
carrusel, ni en el catálogo del recetario; sí sigue accesible para quien la tenía guardada;
y no cuenta en la cobertura por ingrediente. Tras la limpieza no queda ningún título
duplicado publicado.

## Pruebas

Archivo pgTAP nuevo, `supabase/tests/0015_recipe_retirement.test.sql`, con fixtures propias:

- Retirar una receta la saca del snapshot del motor.
- La saca de `discover_recipes_by_ingredients`.
- La saca de `household_taste_recommendations`.
- La saca de `match_recipes`.
- **No** la saca de `find_similar_recipe`: el dedup sigue viéndola.
- La receta retirada sigue siendo legible por id (lo que sostiene las guardadas).
- La vista `ingredient_recipe_coverage` no la cuenta.
- El check rechaza `retired_at` sin motivo, y motivo sin `retired_at`.
- El check rechaza un motivo fuera del vocabulario.
- Tras la limpieza, ningún título tiene más de una receta publicada.
- La limpieza respeta el criterio: entre dos copias, se queda la que alguien tiene guardada.
- Volver a ejecutar la limpieza no retira nada más.
- La limpieza no toca las recetas no reusables: dos usuarios distintos pueden tener cada uno
  su "Tortilla de patatas" generada y ninguna de las dos está de más.

## Después de este slice

Sigue la fase B con la coherencia culinaria en el prompt de generación —incluido el
`image_prompt` que los scripts de semilla todavía no piden—, la generación dirigida a los
huecos que lista la vista de cobertura, y el vocabulario controlado de cocina en lugar de
`tags[1]`.
