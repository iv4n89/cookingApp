# Variedad, cobertura de catálogo, eventos y panel de administración

Fecha: 2026-07-29
Estado: diseño aprobado en conversación, pendiente de ejecutar

## Problema

Cuatro observaciones del usuario tras probar la app en el móvil:

1. Las recetas son siempre las mismas, incluso las de "usar lo que tengo" o "aprovechar
   lo que caduca". Nadie paga por una app que le enseña el mismo plato cada día.
2. Aparecen combinaciones sin sentido culinario ("carne con patatas fritas").
3. Hay ingredientes de la despensa que no dan ninguna receta. El brócoli es el caso
   testigo.
4. Falta contenido de temporada: semanas temáticas, días especiales (San Valentín,
   Navidad), secciones de Home que cambien con la fecha.

Y una necesidad derivada: gestionar todo eso a mano en SQL no escala, hace falta un
panel web de administración.

## Medición sobre producción

Diagnóstico ejecutado el 2026-07-24 contra el proyecto `gnxqmlihdipgtkvaitvq`
(script en el scratchpad de la sesión, solo lecturas). Números que sostienen todo lo
que sigue:

**Catálogo**

| Métrica | Valor |
| --- | --- |
| Recetas totales | 504 |
| Reutilizables (`reusable`) | 495 |
| Con imagen lista | 502 |
| Títulos distintos | 438 (52 títulos duplicados) |
| Sin franja horaria | 24 |

Por franja: almuerzo 451, cena 332, desayuno 53, merienda 36. Desayuno y merienda
están prácticamente vacíos.

Ingredientes por receta: mediana 7, rango 3-14, concentrado en 6-8 (109/107/106
recetas). Con una despensa normal casi toda receta sale con faltantes.

El "tipo de cocina" que muestra la app sale de `tags[1]`, que es texto libre sin
vocabulario controlado: conviven `española` (38), `sopa` (14), `coreano` (9),
`huevo` (6), `postre` (5), y pares que deberían ser el mismo valor
(`argentina` 7 / `argentino` 5, `italiana` 6 / `italia` 5). La diversidad por cocina
que aparenta el descubridor no es real.

**Cobertura de ingredientes** (532 canónicos, `canonical_id is null`)

| Recetas que lo usan | Ingredientes |
| --- | --- |
| 0 | 217 (41%) |
| 1 | 81 |
| 2 | 45 |
| 3 o más | 189 |

343 ingredientes (64% del catálogo) tienen dos recetas o menos. Los huecos no son
aleatorios: faltan casi todas las salsas (pesto, romesco, teriyaki, sriracha), casi
todas las carnes que no son pollo o ternera picada (bacon, jamón cocido e ibérico,
solomillo de cerdo, pechuga de pavo, contramuslo de pollo) y casi todos los cereales
(quinoa, bulgur, avena, harina integral, maicena). El brócoli no se menciona en
ninguna de las 504 recetas.

**Calidad del enlace receta → ingrediente**

19 filas de ingrediente sin `ingredient_id` de 3.790 en total (0,5%), y 0 ingredientes
canónicos en la categoría "Otros". El resolver funciona. **Esto descarta la hipótesis
que se manejaba antes**: los huecos de cobertura no son un problema de enlace mal
resuelto, son ausencia real de recetas.

**Uso real**

`cooked_recipes` tiene una sola fila en toda la historia. No hay señal de
comportamiento sobre la que personalizar todavía; cualquier diseño que dependa de
historial de cocinado tiene que degradar con elegancia a cero datos.

## Diagnóstico

Los cuatro síntomas tienen dos causas distintas y hay que atacarlas por separado.

**La repetición no es falta de contenido, es un embudo.** Hay 495 recetas
utilizables y el motor recorta a una ventana de 31 candidatas
(`household_today_decision` pide 30 alternativas al evaluador). El 94% del catálogo no
se mira nunca. Y ese corte es determinista: el orden final del evaluador es por número
de ingredientes faltantes y desempata por `recipeId`, así que con la despensa quieta
las 31 son siempre las mismas y en el mismo orden. El `random()` que se añadió en la
migración 0062 no ataca eso: baraja solo dentro de esas 31 y lo hace en cada llamada,
de modo que las tarjetas se rebarajan al refrescar la Home pero el conjunto no cambia
de un día para otro. Se arregla en el motor, sin generar una sola receta nueva, y es lo
más barato y lo que más se nota.

**Las recetas fuera de sitio son un problema de orden de filtrado.** La franja horaria
se filtra *después* del corte de candidatas. Con 451 recetas de almuerzo y 53 de
desayuno, a primera hora las 31 candidatas son casi todas de almuerzo, el filtro las
tumba y salta un fallback que ignora la franja: por eso el desayuno acaba siendo un
plato de comida.

**Los huecos de cobertura sí son falta de contenido.** 343 ingredientes con menos de
tres recetas. Se arregla generando, pero dirigido a los huecos, no ampliando el
catálogo a ciegas como en las tandas anteriores (que fue lo que produjo 52 títulos
duplicados).

**Las combinaciones sin sentido son calidad de generación.** El prompt no impone
coherencia culinaria ni tipo de plato, y no hay forma de retirar una receta mala sin
borrarla.

Los eventos y el panel son features nuevas, no arreglos, y dependen de que lo anterior
esté sano: no tiene sentido montar semanas temáticas sobre un catálogo que repite y
tiene agujeros.

## Fases

Orden: A → B → C → D. A y B se pueden solapar (B es sobre todo tiempo de máquina).

### Fase A — Variedad en el motor

Objetivo: que dos días seguidos no muestren lo mismo y que el catálogo entero sea
alcanzable.

Cambios:

1. **Ampliar la ventana de candidatas** de 31 a 121, para que la variedad tenga sobre
   qué actuar.
2. **Filtrar por franja horaria al construir el snapshot, antes del corte.** Es donde
   se elige el conjunto de recetas, y el constructor ya recibe la franja.
3. **Rotación diaria por hogar.** Una semilla derivada de `(household_id, fecha)` que
   sustituye al `random()` actual: determinista dentro del día (refrescar la Home no
   rebaraja) y distinta al día siguiente. La semilla entra como dato del snapshot para
   que el evaluador siga siendo una función pura.
4. **Penalizar lo cocinado recientemente.** Con `cooked_recipes` a una fila esto hoy
   no cambia nada, pero es la señal correcta y hay que dejarla puesta.

El plan de ejecución detallado está en
`docs/superpowers/plans/2026-07-29-variedad-recomendaciones.md`.

Fuera de alcance en A: tabla de impresiones ("ya te lo enseñé ayer"). Se puede añadir
después si la semilla diaria no basta; con 495 recetas y una ventana amplia, no
debería hacer falta todavía.

Criterio de aceptación: para un mismo hogar con la despensa sin tocar, las recetas de
hoy y las de mañana difieren en su mayoría; el conjunto de recetas alcanzables a lo
largo de un mes cubre una fracción sustancial del catálogo, no 31 fijas.

### Fase B — Cobertura y calidad del catálogo

Objetivo: que cualquier cosa que el usuario tenga en la despensa dé al menos tres
recetas, y que las que haya tengan sentido.

Cambios:

1. **Vista de cobertura.** Consulta o vista materializada que dé, por ingrediente
   canónico, cuántas recetas lo usan. Es la lista de trabajo de la generación
   dirigida y la forma de medir si B avanza.
2. **Generación dirigida a huecos.** Alimentar el generador con los ingredientes de
   cobertura < 3 en vez de con temas libres. 343 huecos; cada receta bien dirigida
   cubre dos o tres, así que el orden de magnitud es 350-450 recetas nuevas. Coste:
   ~1,5 $ de imágenes (fal) y horas de proceso con el free tier de Gemini.
   Priorizar por lo que el usuario tiene de verdad en la despensa antes que por el
   catálogo completo.
3. **Coherencia culinaria en el prompt.** Exigir tipo de plato explícito y
   guarniciones coherentes; prohibir combinaciones que solo existen porque dos
   ingredientes estaban en la lista.
4. **Vocabulario controlado de cocina.** Columna `cuisine` con valores cerrados en vez
   de `tags[1]`. Backfill de las 504 recetas existentes (barato: una pasada de
   clasificación) y uso en el descubridor.
5. **Estado de publicación.** Poder retirar una receta (duplicada, incoherente, mala
   foto) sin borrarla. Con eso se resuelven los 52 títulos duplicados, que hasta ahora
   estaban aplazados por no tener dónde marcarlos.

Criterio de aceptación: ingredientes canónicos con 0 recetas por debajo de 50 (desde
217); brócoli con recetas; 0 títulos duplicados publicados.

### Fase C — Eventos y secciones por fecha

Objetivo: que la Home cambie con el calendario.

Modelo: tabla de eventos con rango de fechas, título, criterio de selección de recetas
(etiquetas, ingredientes, tipo de cocina) y prioridad. La decisión de Home la lee el
backend y devuelve las secciones ya resueltas; el cliente no sabe de fechas ni de
San Valentín, solo pinta las secciones que le llegan. Así el móvil no necesita build
nuevo para cada evento.

Depende de B: un evento "Cena de San Valentín" necesita que existan recetas que
encajen.

### Fase D — Panel web de administración

Objetivo: gestionar recetas, ingredientes, eventos, secciones de Home y usuarios sin
tocar SQL.

Va el último porque administra lo que crean B y C. Hoy no existe nada: ni rol de
administrador, ni app web en el monorepo.

Decisiones pendientes antes de poder planificarla:

- Stack de la web (no decidido).
- Cómo se marca a un administrador y cómo lo comprueban las políticas RLS.
- Alcance de la primera versión: probablemente solo recetas (revisar, retirar,
  reeditar) y eventos; usuarios e ingredientes después.

## Decisiones abiertas

- Stack del panel de administración (fase D).
- Si la fase A necesita tabla de impresiones o basta la semilla diaria. Se decide
  midiendo después de A.
- Si la generación dirigida de B se lanza por lotes manuales o como job programado.

## Deuda conocida que arrastra este trabajo

No forma parte de las fases, pero conviene no perderla de vista:

- `docs/PROJECT_STATUS.md` está desactualizado (refleja el estado del 24 de julio;
  desde entonces se ha mergeado hasta la PR #132). La PR #115, que lo actualizaba,
  sigue sin mergear.
- Los scripts de semilla (`generate-recipes.mjs`, `generate-home-recipes.mjs`) no
  piden `image_prompt`, así que la imagen se genera a partir del título y no siempre
  coincide con el plato (deuda aceptada: cerdo → pollo asado). La fase B es el momento
  natural de arreglarlo, porque va a generar cientos de recetas nuevas.
- Los ingredientes que crea el resolver nacen sin perfil de caducidad.

## Referencias

- Motor de recomendación: `supabase/migrations/0056_recommendation_pantry_first.sql`
  y sucesivas (0058, 0060, 0062, 0065, 0067).
- Decisión de Home: `supabase/migrations/0054_household_today_decision.sql` y
  sucesivas (0072 la última).
- Generación de recetas: `scripts/seed/generate-recipes.mjs`,
  `scripts/seed/generate-home-recipes.mjs`.
- Resolver de ingredientes: `supabase/functions/_shared/recipes.ts`.
