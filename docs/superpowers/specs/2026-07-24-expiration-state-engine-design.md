# Diseño: motor de estados aproximados de caducidad

## Objetivo

Transformar la edad de cada lote activo y su perfil aproximado en un estado
reproducible: `fresh`, `consume_soon` o `priority`. El cálculo vivirá en
Postgres y servirá como entrada futura del motor de recomendaciones.

Este slice no mostrará estados en la interfaz, no cambiará Home o chat y no
incorporará los lotes que ya estén fuera de su ventana estimada.

## Decisiones de producto

- La fecha de referencia del lote es `purchased_at`; si no existe, se usa
  `created_at`.
- No se pregunta por ubicación, apertura ni fecha de caducidad.
- Los rangos son estimaciones para priorizar consumo, no garantías de
  seguridad alimentaria.
- Un lote que supera `maxDays` queda fuera del resultado accionable. No se
  etiqueta como caducado, no genera avisos y no entra en recomendaciones.
- Un perfil con `priorityEligible: false`, rango nulo o sin asignación tampoco
  genera un estado accionable.

## Regla de estados

La edad se calcula con precisión temporal como días decimales transcurridos
entre la fecha de referencia del lote y el reloj del servidor. Una fecha de
referencia futura produce edad cero.

Para perfiles prioritizables:

```text
warningLeadDays = min(minDays * 0.25, 7)
consumeSoonAt   = minDays - warningLeadDays

age < consumeSoonAt             => fresh
consumeSoonAt <= age < minDays  => consume_soon
minDays <= age <= maxDays       => priority
age > maxDays                   => sin estado accionable
```

Los límites son deliberadamente exactos: `minDays` ya es `priority` y
`maxDays` todavía es `priority`. Solo una edad estrictamente mayor que
`maxDays` queda fuera.

Esta fórmula deja un aviso corto en productos perecederos y evita que los
productos de larga duración permanezcan meses en `consume_soon`. El aviso
nunca supera siete días.

## Arquitectura

Postgres seguirá siendo la fuente de verdad. El móvil no importará el JSON ni
calculará estados y el LLM no participará en esta decisión.

### Datos de referencia

Una migración añadirá:

- `expiration_profiles`: identificador estable del perfil, `min_days`,
  `max_days`, confianza, elegibilidad y trazabilidad.
- `ingredient_expiration_profiles`: relación uno a uno entre ingrediente
  canónico y perfil, incluyendo el tipo de correspondencia.

Las restricciones de tabla copiarán las invariantes del dataset: rangos
positivos y ordenados para perfiles prioritizables; ambos rangos nulos para
perfiles indefinidos; enums cerrados para confianza y correspondencia.

El cliente autenticado solo podrá leer estos datos globales. Las escrituras
quedarán reservadas a migraciones y `service_role`.

### Generación reproducible

Un script Node convertirá
`packages/shared/src/data/ingredient-expiration-profiles.json` en la sección de
datos de la migración. Las asignaciones resolverán ingredientes por
`normalized_name`, porque sus UUID se generan durante el seed.

El generador tendrá un modo `--check` que comparará la salida esperada con la
migración versionada. El checksum del JSON quedará registrado para que una
edición del dataset no pueda separarse silenciosamente del contenido cargado
en Postgres.

No se mantendrá una segunda copia manual de los 331 mapeos.

### Cálculo

Una función SQL privada y determinista evaluará perfil, fecha de adquisición y
fecha de referencia explícita. Mantener el reloj como argumento permite
fixtures reproducibles y que una futura `RecommendationDecision` conserve su
instante de evaluación.

Una función pública de solo lectura:

1. resolverá el hogar desde `auth.uid()`;
2. seleccionará únicamente lotes con `remaining_quantity > 0`;
3. resolverá primero `coalesce(ingredient.canonical_id, ingredient.id)`;
4. aplicará el perfil y el reloj del servidor;
5. devolverá solo filas con estado accionable.

El cliente no podrá proporcionar el reloj a la función pública. Así no puede
alterar el resultado operativo enviando su propia fecha.

## Contrato de salida

El contrato compartido del snapshot incluirá, como mínimo:

- `batchId` y `pantryItemId`;
- ingrediente canónico, nombre, cantidad restante y unidad;
- instante de adquisición y edad decimal;
- `status`: `fresh`, `consume_soon` o `priority`;
- confianza y tipo de correspondencia;
- ventana estimada `minDays`/`maxDays`;
- código de razón estable.

Los códigos de razón serán datos, no texto de interfaz:

- `within_estimated_window`;
- `approaching_estimated_window`;
- `inside_priority_window`.

La traducción y presentación se diseñarán cuando Home consuma el DTO.

## Ausencias y errores

- Lote sin ingrediente: se omite.
- Ingrediente sin perfil: se omite.
- Cantidad nula, cero o negativa: se omite.
- Perfil no prioritizable o indefinido: se omite.
- Edad superior a `maxDays`: se omite.
- Fecha futura: se evalúa con edad cero.
- Hogar inexistente o usuario no miembro: la función pública falla cerrada.

Omitir significa que no existe acción de caducidad; no equivale a afirmar que
el alimento sea seguro, inseguro o esté caducado.

## Seguridad

- RLS protege los lotes por membresía de hogar.
- La función pública será `security definer`, tendrá `search_path = ''` y
  comprobará la membresía mediante los helpers privados existentes.
- No habrá DML de inventario ni nuevas vías para alterar lotes.
- Los perfiles globales no contienen datos privados.
- Los helpers de evaluación no serán ejecutables por `public`, `anon` ni
  `authenticated`.

## Pruebas

### Generador y datos

- El modo `--check` demuestra que JSON y migración coinciden.
- Los 331 ingredientes se resuelven exactamente una vez.
- Un nombre inexistente, duplicado o un checksum distinto hace fallar la
  generación/verificación.

### Motor

- Límites inmediatamente anteriores, exactos y posteriores a
  `consumeSoonAt`, `minDays` y `maxDays`.
- Perfil corto de 1–2 días.
- Perfil largo donde el aviso queda limitado a siete días.
- Rango no prioritizable y perfil ausente.
- Edad posterior a `maxDays`, sin fila accionable.
- Fecha futura tratada como edad cero.
- Uso de `purchased_at` y fallback a `created_at`.
- Variante que resuelve el perfil de su ingrediente canónico.
- Solo lotes con cantidad positiva.

### Autorización

- Dos miembros del hogar reciben el mismo snapshot.
- Un usuario externo no ve sus lotes.
- El cliente autenticado no puede modificar perfiles ni ejecutar helpers
  privados.

La validación final ejecutará el generador en modo `--check`,
`supabase db reset`, pgTAP, lint, typecheck y `git diff --check`.

## Fuera de alcance

- Persistir el estado calculado.
- Mostrar avisos o estados en móvil.
- Alterar Home, chat o el ranking de recetas.
- Procesar lotes fuera de `maxDays`.
- Modelar ubicación, apertura, etiquetado del fabricante o fechas introducidas
  por el usuario.
- Añadir infraestructura cloud, tareas programadas o notificaciones.

## Criterios de aceptación

- El backend produce el mismo estado para las mismas entradas y el mismo
  instante de referencia.
- La regla de 25 %, con tope de siete días, se aplica en un único lugar.
- Los lotes fuera de ventana no generan ninguna acción.
- JSON, migración y tablas mantienen cobertura y trazabilidad reproducibles.
- RLS y permisos conservan el aislamiento entre hogares.
- No se duplica la lógica en móvil, Edge Functions o prompts.
