# Plan de implementación: dataset de caducidad aproximada

## Fase 0 — Descubrimiento consolidado

**Fuentes locales:** diseño aprobado
`docs/superpowers/specs/2026-07-23-expiration-profiles-data-design.md`;
catálogo controlado `supabase/migrations/0007_ingredients_seed.sql`;
modelo canónico de `0006_ingredients.sql` y
`0027_ingredients_canonical.sql`; scripts ESM de
`scripts/canonicalize/` y `scripts/reclassify-otros/`; configuración raíz y de
`packages/shared`.

**Fuentes externas:** catálogo oficial
`https://catalog.data.gov/dataset/fsis-foodkeeper-data`; JSON español oficial
`https://www.fsis.usda.gov/shared/data/ES/foodkeeper.json`; instantánea
consultable de 2025-07-02 del mismo recurso oficial; tabla
`https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts`; guía
específica de FSIS para ajo en aceite
`https://ask.fsis.usda.gov/article/Can-you-get-botulism-from-garlic-in-oil`.

**Hallazgos:** el seed contiene 331 `normalized_name` únicos. Este slice cubre
esas 331 entradas controladas, no todas las raíces dinámicas con
`canonical_id is null`. FoodKeeper ES contiene 662 productos en filas
representadas como arrays de objetos de una propiedad. Su versión interna es
128 (`FMA-Data-v128.xlsx`, modificación declarada 2018-09-06); la fecha
2025-01-22 de Data.gov es metadato del catálogo y no una revisión científica
demostrada.

**APIs/patrones permitidos:** Node 20 ESM; `readFile` de
`node:fs/promises`; `dirname`, `join` de `node:path`;
`fileURLToPath(import.meta.url)`; `JSON.parse`; `Set`, `Map`,
`Number.isInteger`, `Object.keys` y `Object.hasOwn`. Copiar la resolución de
rutas de `scripts/canonicalize/apply-mapping.mjs` y las validaciones cerradas
de `scripts/reclassify-otros/apply-categories.mjs`.

**Guardas:** no consultar la base runtime; no hacer fuzzy matching automático;
no mezclar alternativas de conservación; no sumar rangos de antes/después de
abrir; no interpretar texto libre como dato estructurado; no convertir
`Indefinidamente`, `Cuando Madure`, `No Recomendado` o `Fecha de Uso` en días
arbitrarios; no añadir ubicación, apertura, fechas del usuario ni umbrales de
estado.

## Fase 1 — Cerrar el contrato y crear el validador

1. Ajustar el diseño y el esquema para que los perfiles no prioritizables
   puedan usar `minDays: null` y `maxDays: null` cuando la fuente indique una
   duración indefinida. Exigir ambos nulos a la vez y
   `priorityEligible: false`; los perfiles prioritizables conservan enteros
   positivos.
2. Crear `scripts/validate-expiration-profiles.mjs`. Copiar el patrón ESM y de
   rutas de `scripts/canonicalize/apply-mapping.mjs:10-12,21,38`.
3. Extraer el segundo literal de cada tupla de
   `supabase/migrations/0007_ingredients_seed.sql:3-333` con un parser estrecho
   por línea. Fallar si cambia el formato, si hay duplicados o si el recuento
   deja de ser 331.
4. Validar forma raíz, metadatos, cobertura exacta, referencias, enums,
   rangos condicionales, perfiles sin uso y claves duplicadas en cualquier
   objeto sin depender de la indentación. Acumular todos los diagnósticos antes
   de devolver código distinto de cero.
5. Añadir a `package.json`
   `"validate:expiration-profiles": "node scripts/validate-expiration-profiles.mjs"`
   y una prueba negativa offline del validador.

**Verificar:** `node --check scripts/validate-expiration-profiles.mjs`; probar
funciones puras del validador con JSON reformateado y fixtures negativos para
claves duplicadas raíz/internas, metadatos, rangos, referencias incompatibles
y acumulación de varios diagnósticos.

**Guardas:** no instalar Ajv, Zod, Jest ni Vitest; no importar el JSON desde
TypeScript; no depender del directorio de ejecución; no copiar manualmente otra
lista de 331 nombres.

## Fase 2 — Investigar y construir los perfiles trazables

1. Recuperar el JSON español oficial o su instantánea archivada en un
   directorio temporal, sin incorporarlo al repositorio. Registrar en
   `sources` la URL oficial, la instantánea consultada, licencia CC0, versión
   interna 128, archivo de origen, fecha declarada y fecha de consulta.
2. Colapsar cada fila `Product` mediante `Object.assign({}, ...rawRow)` solo
   para inspección. Consultar conjuntamente `ID`, `Category_ID`, `Name`,
   `Name_subtitle` y `Keywords`.
3. Crear en
   `packages/shared/src/data/ingredient-expiration-profiles.json` una biblioteca
   pequeña de perfiles reutilizables. Convertir únicamente `Días`, `Semanas`,
   `Meses`, `Años` y `Horas` mediante una tabla explícita; conservar rangos y
   redondear horas a un mínimo operativo de un día.
4. Para cada perfil registrar `sourceId` y un `sourceRef` estable con versión,
   Product ID y nombre/subtítulo español. Si varias filas sustentan una
   familia, enumerarlas en el mismo texto de referencia.
5. Elegir una sola conservación doméstica habitual durante la investigación,
   sin guardar ubicación en el modelo. Priorizar el contexto numérico
   coherente con el alimento fresco o estable; nunca promediar alternativas.
6. Representar `Indefinidamente` con rango nulo y
   `priorityEligible: false`. Para `Fecha de Uso`, `Cuando Madure` o ausencia de
   rango, usar un perfil numérico de familia solo si existe evidencia
   comparable; en otro caso, fallback de confianza baja revisado manualmente.

**Verificar:** revisar todos los perfiles; comprobar `minDays <= maxDays`;
buscar métricas especiales no resueltas; contrastar carne, aves, pescado,
huevos y sobras con la tabla oficial de conservación en frío.

**Guardas:** no tratar la traducción como adaptada al mercado español; no usar
FoodData Central; no presentar `maxDays` como fecha de seguridad; no inventar
diferencias entre variedades equivalentes.

## Fase 3 — Mapear los 331 canónicos

1. Recorrer las 12 categorías del seed y asignar cada `normalized_name` a un
   perfil. Usar `direct` solo para equivalencias semánticas y de estado de
   preparación; `family` para una familia homogénea; `fallback` para
   estimaciones editoriales conservadoras.
2. Conservar denominaciones e IDs originales en `sourceRef`; usar
   normalización de tildes y alias únicamente para buscar, nunca como prueba
   automática de equivalencia.
3. Compartir perfiles entre variedades con conservación materialmente igual:
   arroces secos, legumbres secas, cortes equivalentes, cebollas, etc.
4. Marcar sal y otros productos oficialmente indefinidos como no
   prioritizables. Los productos de vida larga con rango de calidad sí
   conservarán días y podrán ser prioritizables sin recibir trato urgente
   hasta alcanzar su ventana.
5. Ejecutar el validador después de cada categoría y corregir cualquier
   ausencia, extra, perfil huérfano o confianza inválida.

**Verificar:** 331 claves exactas, 331 asignaciones válidas, cero extras y cero
perfiles sin uso. Revisar manualmente al menos tres elementos de cada categoría
y todas las asignaciones `fallback`.

**Guardas:** no derivar claves desde `name`; usar exactamente `normalized_name`;
no extraer el alcance desde Supabase; no añadir ingredientes generados en
runtime; no asignar conservas a su equivalente fresco.

## Fase 4 — Validación final y entrega

1. Ejecutar:
   - `node --check scripts/validate-expiration-profiles.mjs`
   - `pnpm validate:expiration-profiles`
   - `pnpm test:expiration-profiles`
   - `pnpm lint`
   - `pnpm typecheck`
   - `git diff --check`
2. Inspeccionar el diff para confirmar que solo incluye especificación, plan,
   dataset, validador y script raíz; excluir `.claude/`.
3. Revisar trazabilidad y coherencia de una muestra estratificada de todas las
   categorías, además de todas las entradas `fallback` y
   `priorityEligible: false`.
4. Commit de implementación, apertura de PR y revisión mediante agente según
   `CLAUDE.md`. Corregir hallazgos y pedir confirmación antes de fusionar.

**Criterio de salida:** el JSON cubre exactamente los 331 canónicos controlados,
cada asignación es trazable, ningún dato de ubicación/apertura/fecha del usuario
aparece y el validador offline pasa sin dependencias nuevas.
