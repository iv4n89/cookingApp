# Recetario — Diseño

## Objetivo

Dar un sitio donde ver las recetas disponibles cuando se quiera: explorar el catálogo completo
(~373 reusables y creciendo) y consultar las guardadas. Hoy no existe: las recetas solo aparecen
empujadas por la Home o el chat, y los favoritos viven en una pantalla suelta.

Es además la casa donde vivirá el futuro **descubridor** de recetas (feature aparte).

## Decisiones de producto (confirmadas)

- **Ubicación**: nuevo tab **"Recetas"** con dos sub-secciones: **Todas** | **Guardadas**.
- **Exploración**: búsqueda por nombre + filtros de **Momento** (desayuno/almuerzo/merienda/cena) y
  **Dieta** (vegetariana/vegana). Scroll infinito.
- **Filtro por cocina/región: FUERA del MVP.** La región vive de forma irregular dentro de `tags`
  (generada por IA), así que un filtro por cocina sería poco fiable. Se añadirá cuando la cocina sea
  un campo propio y curado (encaja con el trabajo del descubridor).

## Arquitectura

Feature de cliente. **Sin backend nuevo**: la política `recipes_select_authenticated`
(`supabase/migrations/0002_rls_profiles.sql:52`) ya permite a cualquier autenticado leer el catálogo,
y las columnas necesarias existen (`title`, `description`, `image_url`, `image_status`, `meal_types`,
`diet`, `reusable`).

### Navegación

- Nuevo tab `apps/mobile/src/app/(tabs)/recetas.tsx`, registrado en `(tabs)/_layout.tsx` (pasa de 4
  a 5 tabs: Inicio, Alacena, Lista, Recetas, Chat).
- Dentro, un selector de dos pestañas: **Todas** (explorar catálogo) y **Guardadas**.
- **Guardadas** reutiliza la lógica existente de favoritos (`useFavorites` +
  `features/favorites/components/favorite-row.tsx`), montada dentro del tab en vez de en una
  pantalla suelta. La ruta `/favoritos` se mantiene (la enlaza el perfil) para no romper accesos.
- Tocar una receta abre `receta/[id]` (comportamiento ya existente).

### Consulta del catálogo ("Todas")

Nueva función en `apps/mobile/src/lib/recipes.ts`:

```ts
export interface RecipeListFilters {
  search?: string;
  mealType?: MealType | null;
  diet?: 'vegetarian' | 'vegan' | null;
}

export async function listCatalogRecipes(
  filters: RecipeListFilters,
  page: number,
): Promise<Recipe[]>
```

- Base: `from('recipes').select(...).eq('reusable', true).order('title').range(from, to)` con
  `PAGE_SIZE = 20`. Se filtra por `reusable` para no listar las recetas efímeras del chat
  (`reusable=false`), coherente con `match_recipes` y el motor.
- `search`: `.ilike('title', '%' + término + '%')`.
- `mealType`: `.contains('meal_types', [mealType])`.
- `diet`: `.contains('diet', [diet])` (hay índice GIN en `diet`).
- Orden estable por `title` para que la paginación no baile entre páginas.

**Acentos**: `ilike` no ignora tildes. En el MVP se acepta (buscar "platano" no encuentra "plátano").
Si molesta en uso real, se resuelve después con `unaccent` o una columna normalizada; no se añade
ahora para no meter migración en una feature de cliente.

### UI

- `features/recipe-book/components/recipe-filters.tsx`: buscador (input con debounce ~300 ms) y dos
  filas de chips (Momento, Dieta), cada chip alternable y con opción "Todos".
- `features/recipe-book/hooks/use-recipe-book.ts`: estado de filtros, lista acumulada, `page`,
  `loading`, `loadingMore`, `hasMore`; expone `loadMore()` y resetea la lista al cambiar filtros.
- La lista usa `FlatList` con `onEndReached` (scroll infinito) y reutiliza `RecipeCard`
  (`components/recipe-card.tsx`).
- Las cards del recetario **no** llevan toggle de guardar: mantenerlo sincronizado con la pestaña
  Guardadas exigiría cargar y reconciliar el set de favoritos en ambas listas, y se guarda igual
  desde el detalle de la receta (a un toque). Se revisará si en uso real resulta incómodo.
- Tampoco llevan badge de faltantes (aquí no se cruza la despensa): usan una etiqueta neutra
  "RECETA".

## Errores y casos borde

- **Sin resultados** (filtros o búsqueda demasiado estrechos): mensaje vacío claro invitando a
  quitar filtros.
- **Fallo de red**: la lista queda como estaba y se permite reintentar; no se rompe el tab.
- **Guardadas vacío**: mensaje existente de favoritos ("Aún no tienes recetas favoritas").
- **Imágenes**: muchas recetas del catálogo aún no tienen imagen. El recetario NO encola generación
  (sería costoso al hacer scroll por cientos); muestra el placeholder que ya maneja `RecipeCard`.

## Testing

- Sin backend nuevo → sin pgTAP.
- `pnpm typecheck` y `expo lint` en verde.
- Verificación manual en dispositivo: buscar por nombre, combinar filtros, scroll infinito
  (que cargue más allá de la primera página), guardar desde el recetario y verlo en Guardadas.

## Alcance explícitamente fuera

- Filtro por cocina/región (hasta tener el campo curado).
- Filtro "cocinable con mi despensa" (posible evolución; requiere cruzar el motor).
- Búsqueda insensible a acentos.
- El descubridor tipo reels (feature separada, vivirá en este mismo tab).
