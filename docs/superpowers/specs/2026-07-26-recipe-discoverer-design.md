# Descubridor de recetas — Diseño

## Objetivo

Explorar recetas de forma ligera y adictiva: eliges ingredientes de una lista, pulsas **Descubrir** y
aparecen recetas a pantalla completa (imagen, nombre, descripción e ingredientes) que se pasan con el
dedo como los reels de Instagram, guardando las que llaman la atención.

Vive dentro del tab **Recetas** (creado en el recetario, PR #118).

## Decisiones de producto (confirmadas)

- **Gesto**: desplazamiento **vertical** (reels). Guardar con **doble toque** sobre la card, más un
  botón visible. Guardar = favorito → aparece en "Guardadas" del recetario.
- **Selección de ingredientes**: catálogo completo con buscador, con acceso rápido a los de la
  despensa.
- **Imágenes**: se generan **todas** las que faltan en el catálogo (~440, ~1-2 € con fal Flux
  schnell) antes de estrenar la feature.
- **Regla de coincidencia**: con 2+ ingredientes elegidos, las recetas pueden traer como máximo
  **2 ingredientes extra**; con **1 solo** ingrediente elegido, **sin límite** de extras (modo
  "pollo, a ver qué sale").
- **Ingredientes en la card**: se muestran los primeros ~6 y un "+N más"; el detalle completo a un
  toque (abre la receta).
- **Recetas sin imagen**: no se excluyen, van al final del orden.
- **Alérgenos**: el descubridor **no filtra**, pero **avisa**. Las recetas que chocan con las
  necesidades del hogar se muestran con una marca visible "Contiene &lt;alérgeno&gt;". Explorar sin
  recortar el catálogo, pero sin sorpresas.

## Arquitectura

### 1. Motor: RPC `discover_recipes_by_ingredients`

```sql
create function public.discover_recipes_by_ingredients(
  p_ingredient_ids uuid[],
  p_max_extra integer default 2,
  p_limit integer default 40
) returns jsonb
```

`stable`, `security definer`, `set search_path=''`, grant a `authenticated` (la llama el móvil
directo con el JWT, como `household_today_decision`). No necesita hogar: es exploración del
catálogo, no depende de la despensa.

Lógica por receta (solo `reusable`):

1. **Canónicos**: los ingredientes elegidos se normalizan a `coalesce(canonical_id, id)`, y los de la
   receta también. Así elegir "cebolla" casa con "cebolla blanca" de la receta. Coherente con el
   resto de la app (migración 0027).
2. **Básicos asumidos**: se ignoran al contar extras. Lista idéntica a la del motor
   (`0065_recommendation_taste_affinity.sql:319-323`): sal marina/gorda/fina/de mesa, aceite de oliva
   virgen extra/suave, aceite de girasol, pimienta negra, pimienta de Sichuan, sal y pimienta.
3. **Métricas**: `uses` = cuántos de los elegidos aparecen en la receta; `extras` = ingredientes
   canónicos de la receta (no básicos) que **no** están entre los elegidos.
4. **Filtro**: `uses >= 1` siempre. Si `cardinality(p_ingredient_ids) >= 2`, además `extras <= p_max_extra`.
   Con **un solo** ingrediente elegido no se aplica el tope (decisión de producto).
5. **Orden**: `uses desc` (aprovecha más de lo que elegiste), `extras asc`, **recetas con imagen
   antes que sin imagen**, y `random()` para desempatar (cada sesión se siente fresca, igual que la
   Home). `limit p_limit`.

Devuelve un array JSON de cards con lo que pinta el visor: `recipeId, title, description, imageUrl,
imageStatus, extras, ingredientNames` (nombres de los ingredientes de la receta, para la lista de la
card sin pedir la receta completa) y `warnAllergens`.

**Aviso de alérgenos** (`warnAllergens`): array con los alérgenos de la receta que chocan con las
necesidades del hogar. Se calcula cruzando `recipes.allergens` con los alérgenos derivados de los
`special_needs` de los miembros vía `need_allergen_map` (mismo mapa y misma lista de needs que
`build_household_recommendation_snapshot`, `0053_recommendation_decision.sql:401-404`). Vacío cuando
no hay conflicto. **No filtra**: solo alimenta la marca visible de la card.

Como esto sí necesita el hogar, la RPC deriva `auth.uid()` + `current_household_id()` para el aviso,
pero **no falla** si no hay hogar: en ese caso devuelve `warnAllergens` vacío y sigue funcionando.

**Rendimiento**: ~373 recetas reusables; expandir su `ingredients` jsonb y cruzar contra el array de
elegidos es un escaneo pequeño, sobrado para este tamaño. No se añade índice; si el catálogo crece
mucho, se revisará.

### 2. Selector de ingredientes

Componente propio (`features/discoverer/components/ingredient-multi-select.tsx`), **no** se reutiliza
`components/ingredient-picker.tsx`: ese está atado a añadir a despensa/lista (cantidad, unidad,
mínimo) y aquí solo hace falta multi-selección. Sí reutiliza `listIngredients()` de
`lib/ingredients.ts` y el estilo visual de miniaturas.

- Buscador por nombre + lista agrupada por categoría.
- Chips de los elegidos arriba, con quitar.
- Sección "De tu despensa" al principio (nombres de `pantry_items` del hogar) para elegir rápido.
- Botón **Descubrir** deshabilitado si no hay ninguno elegido.

### 3. Visor tipo reels

`features/discoverer/components/recipe-reel.tsx` + pantalla `app/descubrir.tsx` (ruta propia, se
abre desde el tab Recetas).

- `FlatList` vertical con `pagingEnabled`, `snapToInterval` = alto de pantalla, `decelerationRate="fast"`.
- Cada página: imagen a sangre completa de fondo, degradado inferior para legibilidad, y sobre él
  título, descripción (2-3 líneas) y los primeros 6 ingredientes con "+N más".
- Si `warnAllergens` no está vacío, marca visible sobre la card: "Contiene &lt;alérgenos&gt;".
- **Doble toque** para guardar: se detecta con `Pressable` y comparación de timestamps (< 300 ms
  entre toques), sin dependencias nuevas. Muestra una animación breve de confirmación.
- Botón de guardar visible (icono bookmark) que refleja el estado guardado.
- Toque simple en el texto → abre `receta/[id]`.
- Al final de la lista, una página de cierre: "No hay más recetas con esos ingredientes" + botón para
  volver al selector.

Guardar usa `setFavorite` de `lib/user-recipes.ts` (el mismo que la Home), con actualización
optimista y reversión si falla.

### 4. Imágenes del catálogo

Script `scripts/backfill-recipe-images.mjs`: busca recetas con `image_status <> 'ready'` e invoca la
Edge Function `ensure-recipe-image` por lotes, con pausa entre llamadas para no saturar fal ni la
función. Re-ejecutable (salta las que ya tienen imagen). Se ejecuta una vez contra la nube.

## Errores y casos borde

- **Sin ingredientes elegidos**: el botón Descubrir está deshabilitado; la RPC con array vacío
  devuelve `[]`.
- **Sin resultados** (combinación imposible): página de cierre con mensaje claro y botón para cambiar
  ingredientes. No se cae a "cualquier receta" para no engañar.
- **Receta sin imagen**: se muestra igual con un fondo neutro; el visor **no** encola generación (el
  backfill ya cubre el catálogo y encolar por scroll sería costoso).
- **Fallo de red al guardar**: se revierte el estado visual y se puede reintentar; no rompe el visor.
- **Ingredientes elegidos que no existen en ninguna receta**: caso normal de "sin resultados".

## Testing

- pgTAP `discover_recipes_by_ingredients`: (a) existe y solo `authenticated` la ejecuta; (b) con dos
  ingredientes elegidos, una receta con 1 extra entra y otra con 5 extras no; (c) con **un** solo
  ingrediente elegido, entra también la de 5 extras (sin tope); (d) los básicos (sal/aceite) no
  cuentan como extra; (e) el match es por canónico (elegir el canónico casa con la variante);
  (f) array vacío → `[]`; (g) con una necesidad del hogar que mapea a un alérgeno, la receta que lo
  contiene **sigue apareciendo** pero con ese alérgeno en `warnAllergens`.
- Cliente: `pnpm typecheck` y `expo lint` limpios (baseline de main: 0 warnings).
- Verificación manual: elegir 2-3 ingredientes, comprobar que las recetas encajan con la regla,
  pasar con el dedo, guardar con doble toque y verlo en "Guardadas".

## Entrega (slices)

- **PR A (backend)**: RPC + pgTAP. Entra con `db push`.
- **PR B (script)**: backfill de imágenes; se ejecuta contra la nube.
- **PR C (cliente)**: selector + visor reels + entrada desde el tab Recetas. Requiere rebuild de APK
  (se agrupa con el recetario, que también está pendiente de build).

## Alcance explícitamente fuera

- Ponderar el orden por afinidad de gusto (posible evolución; el motor ya calcula `tasteAffinity`).
- **Filtrar** (excluir) por alérgenos: se avisa, no se recorta el catálogo. Si en uso real molesta
  ver recetas incompatibles, se añadirá un interruptor "ocultar las que no puedo comer".
- Descartar con gesto (no hay "no me gusta" persistente).
