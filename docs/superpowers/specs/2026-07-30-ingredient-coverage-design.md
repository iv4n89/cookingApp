# Vista de cobertura por ingrediente canónico

Fecha: 2026-07-30
Estado: diseño aprobado en conversación, pendiente de ejecutar
Fase: B, primer slice. Diseño de la fase completa en
`docs/superpowers/specs/2026-07-29-variedad-y-contenido-design.md`.

## Problema

Hay ingredientes en la despensa que no dan ninguna receta. El brócoli es el caso
testigo: no se menciona en ninguna de las 504 recetas del catálogo. La medición del
24 de julio contó 217 ingredientes canónicos sin ninguna receta y 343 con menos de
tres, sobre 532 canónicos.

Esos números salieron de una consulta suelta ejecutada a mano contra producción, que
vive en el scratchpad de una sesión ya cerrada. Para dirigir la generación de recetas
a los huecos hace falta la misma cuenta como objeto del esquema: es a la vez la lista
de trabajo (a qué ingredientes dirigir la generación) y la métrica de avance (si el
hueco se cierra o no).

Sin esa instrumentación, generar a ciegas es lo que produjo las tandas anteriores y
sus 52 títulos duplicados.

## Alcance

Solo la vista y sus pruebas. No genera ninguna receta: es lo que permite decidir qué
generar en el slice siguiente.

## Modelo de datos vigente

Los ingredientes de una receta no están en una tabla puente: viven en
`recipes.ingredients`, un `jsonb` con una entrada por ingrediente y la clave
`ingredient_id` apuntando al catálogo (`0001_init.sql:15`).

El catálogo agrupa variantes bajo un canónico con `canonical_id`, donde
`canonical_id is null` significa "es su propio canónico"
(`0027_ingredients_canonical.sql`). El match se resuelve siempre por
`coalesce(canonical_id, id)`, y así lo hacen el motor de recomendación
(`0065_recommendation_taste_affinity.sql:151`) y el consumo FEFO
(`0045_batch_consumption_helper.sql:26`). La vista usa la misma regla: contar por
variante daría una cobertura inventada, porque la despensa y las recetas se cruzan
por canónico.

`reusable` es la columna que marca si una receta sirve para cualquier hogar o se generó
para un usuario concreto (`0016_personalized_recipes.sql`).

## Diseño

Una vista `ingredient_recipe_coverage` en la migración `0076`, con una fila por
ingrediente canónico. Sería la primera vista del esquema: hasta ahora todo son tablas
y funciones. Encaja igual, porque esto es una consulta con nombre y no tiene
parámetros ni necesita contexto de hogar.

| Columna | Significado |
| --- | --- |
| `ingredient_id` | Id del canónico |
| `name` | Nombre del canónico |
| `category` | Categoría del catálogo |
| `recipe_count` | Recetas del catálogo que lo usan |
| `reusable_recipe_count` | De esas, las que además pueden llegar a la Home |

**Filas**: los ingredientes con `canonical_id is null`. Las variantes no tienen fila
propia; suman a la de su canónico.

**Cómo cuenta**: despliega `recipes.ingredients` y resuelve cada `ingredient_id` a
`coalesce(canonical_id, id)`. Cuenta recetas distintas, no filas de ingrediente: una
receta que menciona dos variantes del mismo canónico cuenta una vez, no dos.

**Ingredientes sin recetas**: aparecen con cero, no desaparecen. Son justamente la
lista de trabajo, así que un `left join` desde `ingredients`, no un `inner join`.

**Las dos cuentas**: `recipe_count` cubre todo el catálogo, que es el criterio pedido.
`reusable_recipe_count` va al lado porque una receta no reusable se generó para un
usuario concreto y no llegará nunca a la Home de otro: sin esa segunda columna, un
ingrediente puede parecer cubierto y seguir sin salir jamás. Hoy la diferencia son 9
recetas de 504, pero la señal no cuesta nada y deja de ser marginal en cuanto se
generen recetas personalizadas.

**Categoría**: entra porque los huecos no son aleatorios. La spec de la fase B los
agrupa por familias —casi todas las salsas, casi todas las carnes que no son pollo o
ternera picada, casi todos los cereales— y con la categoría una tanda de generación
puede atacar una familia entera en vez de ir ingrediente a ingrediente.

## Decisiones tomadas

- **Vista normal, no materializada.** 532 ingredientes y 504 recetas se agregan en
  milisegundos. Una materializada solo añadiría el problema de cuándo refrescarla.
- **Sin RPC ni exposición al cliente.** La consumen los scripts de generación y las
  consultas manuales. `select` para `service_role` y nada más: no es dato de usuario,
  y el panel de administración de la fase D no existe todavía ni tiene stack decidido.
- **Sin tabla de histórico.** Para medir el avance basta con la línea base escrita en
  este documento y volver a consultar la vista. Guardar snapshots es trabajo que solo
  se justifica si alguien va a graficar la serie, y nadie va a hacerlo.
- **Sin señal de presencia en despensas.** La fase B dice priorizar por lo que la
  gente tiene de verdad, pero con los hogares que hay hoy esa señal no distingue
  nada. Se añade cuando haya usuarios que la hagan significativa.
- **Las filas de ingrediente sin `ingredient_id` quedan fuera.** Son 19 de 3.790
  (0,5%) y no se pueden atribuir a ningún canónico. No cambian ninguna decisión de
  generación.

## Línea base (medición del 24 de julio de 2026)

Contra el proyecto `gnxqmlihdipgtkvaitvq`. Es el punto de partida contra el que se
compara después de generar:

| Recetas que lo usan | Ingredientes canónicos |
| --- | --- |
| 0 | 217 (41%) |
| 1 | 81 |
| 2 | 45 |
| 3 o más | 189 |

Total: 532 canónicos, 343 (64%) con dos recetas o menos. Catálogo: 504 recetas, 495
reusables.

La primera consulta de la vista tras desplegarla debe reproducir estos números. Si no
lo hace, o la medición del 24 de julio contaba otra cosa o la vista está mal: hay que
averiguar cuál de las dos antes de generar nada encima.

## Criterio de aceptación

La vista existe y responde, para cualquier ingrediente canónico, cuántas recetas lo
usan; los que tienen cero aparecen con cero; las variantes suman a su canónico. El
objetivo de la fase B —bajar de 217 a menos de 50 los ingredientes con cero recetas—
se mide con ella.

## Pruebas

Archivo pgTAP nuevo, `supabase/tests/0014_ingredient_coverage.test.sql`. Sobre
fixtures propias, no sobre el catálogo real:

- Un ingrediente usado por dos recetas cuenta dos.
- Una variante con `canonical_id` no tiene fila propia y suma a la de su canónico.
- Una receta que menciona dos variantes del mismo canónico cuenta una vez, no dos.
- Un ingrediente que ninguna receta usa aparece con `recipe_count` cero.
- Una receta no reusable suma en `recipe_count` y no en `reusable_recipe_count`.
- Una fila de ingrediente sin `ingredient_id` no rompe la vista ni inventa filas.

## Después de este slice

El resto de la fase B, en orden: estado de publicación para poder retirar recetas
(y cerrar los 52 títulos duplicados), coherencia culinaria en el prompt de
generación, generación dirigida a los huecos que liste esta vista, y vocabulario
controlado de cocina en lugar de `tags[1]`.
