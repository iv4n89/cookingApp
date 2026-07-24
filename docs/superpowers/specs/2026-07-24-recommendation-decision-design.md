# Diseño: `RecommendationDecision`

**Fecha:** 24 de julio de 2026

**Estado:** aprobado para planificación

**Ámbito:** Fase 2 — caducidad y decisión reproducible

## Objetivo

Sustituir progresivamente el ranking opaco de `recommended_recipes(...)` por
un caso de uso determinista que responda qué receta conviene cocinar ahora,
qué alternativas existen y por qué. La misma entrada y la misma versión de
política deben producir la misma decisión sin llamar a un LLM.

Este diseño incorpora dos prerrequisitos: un mapa curado de alérgenos por
ingrediente y una clasificación estructurada de la afinidad culinaria
estacional de las recetas. En esta primera versión, el producto se limita a
España y al hemisferio norte.

## Alcance

El trabajo se entregará en tres features y tres PR independientes:

1. Datos versionados ingrediente → alérgenos.
2. Metadatos estacionales versionados para el catálogo de recetas.
3. Motor `RecommendationDecision` sobre inventario, caducidad y restricciones.

Cada PR debe estar validada y fusionada antes de comenzar la siguiente.

Este alcance no:

- modifica Home ni chat;
- elimina todavía la RPC heredada `recommended_recipes(...)`;
- incorpora historial, coste, dificultad o nutrición al ranking;
- persiste decisiones para telemetría;
- introduce nuevas Edge Functions, microservicios o infraestructura cloud;
- usa sustituciones de ingredientes para declarar una receta cocinable.

## Decisiones de producto

### Restricciones híbridas

Las recomendaciones usan:

- la unión de alergias y necesidades médicas de todos los miembros del hogar;
- la dieta derivable de las preferencias alimentarias del usuario solicitante.

La decisión solo devuelve las restricciones efectivas, sin atribuirlas a
miembros concretos.

En la política v1 solo `Vegana` y `Vegetariana` tienen un mapeo estructurado a
dieta. El resto de preferencias blandas —objetivos, sabores, estilo y tipo de
cocina— no participa hasta disponer de metadatos de receta y reglas
deterministas. No se interpreta mediante prompts.

Una necesidad médica sin mapeo o cualquier nota libre del hogar se considera
una restricción no soportada y activa el fallo cerrado descrito más adelante.

Las etiquetas `recipes.allergens` actuales proceden en parte de IA y no bastan
para afirmar seguridad. La política usa como fuente primaria el mapa curado
por ingrediente descrito a continuación y conserva las etiquetas de receta
solo como defensa adicional.

### Receta principal y alternativas

La salida contiene una receta principal y una lista ordenada de alternativas.
Si existe al menos una receta cocinable con la despensa actual, la principal
debe pertenecer a ese grupo. Solo cuando no exista ninguna se puede elegir una
alternativa que requiera compras.

Los modos son:

- `cook_now`: cantidades suficientes para todos los ingredientes obligatorios;
- `shop_then_cook`: faltan uno o más ingredientes o cantidades;
- sin selección: no existe ninguna candidata segura.

Una receta que requiere compras nunca se presenta como cocinable.

### Disponibilidad estricta y básicos asumidos

La disponibilidad se calcula con cantidades, unidades y equivalencias
canónicas. No basta con que un ingrediente esté presente.

La política v1 considera siempre disponibles únicamente estos básicos:

- sal marina;
- sal gorda;
- sal fina;
- sal de mesa;
- aceite de oliva virgen extra;
- aceite de oliva suave;
- aceite de girasol.

La lista se resuelve contra ingredientes concretos del catálogo, queda
versionada con la política y no se amplía por categoría. Aceites específicos,
como sésamo, trufa o ajo, siguen siendo ingredientes obligatorios.

Los básicos asumidos:

- no cuentan como faltantes;
- no suman disponibilidad;
- no aportan prioridad de caducidad.

### Afinidad culinaria estacional

La clasificación describe la afinidad de consumo de la receta —fresca,
ligera, fría, de cuchara o reconfortante—, no la temporada natural de sus
ingredientes.

Para España se usan estaciones meteorológicas:

- `spring`: marzo, abril y mayo;
- `summer`: junio, julio y agosto;
- `autumn`: septiembre, octubre y noviembre;
- `winter`: diciembre, enero y febrero;
- `all_year`: afinidad neutra durante todo el año.

La estación es una señal blanda. Nunca excluye una receta segura y no puede
superar el aprovechamiento de alimentos prioritarios.

Una coincidencia con la estación actual aporta afinidad según la confianza:
`high = 1`, `medium = 0.75` y `low = 0.5`. `all_year`, una estación distinta o
la ausencia de perfil aportan `0`: son neutrales y nunca penalizan.

## Arquitectura

El motor permanece en el monolito modular de Supabase.

### Datos de seguridad por ingrediente

Un dataset versionado cubre cada ingrediente exacto del catálogo y declara:

- alérgenos controlados que contiene;
- lista vacía explícita cuando fue revisado y no contiene ninguno;
- fuente y referencia;
- versión del dataset.

El manifiesto declara también qué exclusiones soporta esa versión. La política
v1 cubre las claves actuales que admiten una relación conservadora por
ingrediente:

- `gluten`, `crustaceans`, `molluscs`, `egg`, `fish`, `peanut`, `soy`;
- `milk`, `nuts`, `celery`, `mustard`, `sesame`;
- `pork` y `alcohol` como exclusiones de producto, no como alérgenos.

`fructose`, `histamine` y `sorbitol` dependen de cantidad, procesamiento y
tolerancia clínica, por lo que no se representarán como booleanos seguros en
v1. Halal y kosher tampoco se tratarán como certificaciones. Esas necesidades,
el resto de condiciones clínicas y las notas libres producen
`unsupported_household_restriction`.

Las necesidades soportadas por la política v1 son: `Frutos secos`,
`Cacahuete`, `Marisco`, `Pescado`, `Huevo`, `Leche`, `Soja`, `Sésamo`,
`Mostaza`, `Apio`, `Lactosa`, `Gluten / celiaquía`, `Sin cerdo` y
`Sin alcohol`. La lista forma parte de `policyVersion`; cualquier otro valor
falla cerrado aunque tenga un mapeo aproximado heredado.

La curación regulatoria parte del
[anexo II del Reglamento (UE) 1169/2011](https://eur-lex.europa.eu/legal-content/ES/ALL/?uri=celex%3A32011R1169)
y de la
[guía de alérgenos de AESAN](https://www.aesan.gob.es/AECOSAN/docs/documentos/seguridad_alimentaria/gestion_riesgos/guia_aplicacion_informacion.pdf).
El producto no amplía silenciosamente ese marco: sulfitos y altramuces exigen
una futura ampliación del vocabulario y de la captura de preferencias.

La ausencia de una fila significa “sin revisar”, no “sin alérgenos”. El
generador de la migración exige cobertura exacta del seed, rechaza duplicados,
valores desconocidos y referencias a ingredientes inexistentes, e incluye un
checksum del dataset.

La tabla global, conceptualmente `ingredient_allergen_profiles`, se relaciona
con el ingrediente exacto. En ejecución se intenta primero el ingrediente
canónico y después el ingrediente directo, como en los perfiles de caducidad.

Cuando el hogar tenga exclusiones:

1. todos los ingredientes obligatorios de la receta deben resolverse;
2. todos deben tener un perfil curado, incluso si su lista está vacía;
3. la unión de alérgenos de ingredientes y `recipes.allergens` se compara con
   las exclusiones efectivas;
4. cualquier falta de cobertura excluye la receta.

El mapa cubre alérgenos y exclusiones de ingredientes representables, como
cerdo o alcohol. No equivale a una certificación halal o kosher ni interpreta
condiciones clínicas complejas.

### Metadatos estacionales

Una relación global de solo lectura, conceptualmente
`recipe_season_profiles`, guarda:

- `recipe_id`;
- estaciones aplicables;
- `confidence`: `high`, `medium` o `low`;
- `source`: `curated`, `generated` o `backfill`;
- `classifier_version`;
- fecha de clasificación.

El catálogo base usa datos versionados, validables y revisables. El pipeline de
ingreso de nuevas recetas debe guardar la clasificación estructurada y
sanitizarla contra el vocabulario cerrado. Una receta aún no clasificada sigue
siendo candidata con contribución estacional neutra.

`all_year` debe aparecer solo; cualquier otro perfil contiene una o más
estaciones concretas sin duplicados.

La clasificación puede usar IA como herramienta de catalogación, pero el
ranking nunca consulta a la IA. Solo consume el resultado persistido.

### Evaluador privado

Funciones privadas y deterministas reciben datos explícitos para:

- convertir la fecha de evaluación en estación;
- calcular cobertura de cantidades;
- simular el consumo FEFO relevante para una receta;
- clasificar `cook_now` o `shop_then_cook`;
- calcular componentes de ranking y códigos de razón.

El evaluador no lee identidad del usuario, no conversa y no accede a un
proveedor de IA. Sus permisos de ejecución se revocan a clientes.

### Caso de uso público

Una RPC autenticada:

1. obtiene al usuario mediante `auth.uid()`;
2. deriva su único hogar;
3. comprueba la membresía;
4. captura una única fecha de evaluación del servidor y la convierte a la zona
   `Europe/Madrid`;
5. construye el snapshot efectivo;
6. filtra candidatas y ejecuta la política vigente;
7. devuelve un único `RecommendationDecision`.

La función no acepta `household_id`, inventario, scores, estación ni reloj
proporcionados por el cliente. El móvil solo aporta la franja de comida y el
límite de alternativas. La política inicial devuelve por defecto una principal
y cinco alternativas; el servidor limita las alternativas solicitadas a diez.

La RPC usa `security definer`, `search_path` vacío y filtros explícitos por
`household_id`; no confía únicamente en RLS dentro de la función.

## Snapshot de entrada

La respuesta conserva los datos que explican la decisión:

- `householdId`;
- `requestingUserId`;
- `evaluatedAt`;
- `evaluationDate` en `Europe/Madrid`;
- `season`;
- `mealType`;
- `policyVersion`;
- versión del dataset de seguridad;
- restricciones efectivas;
- identificadores y cantidades de lotes considerados;
- estados de caducidad utilizados;
- entradas normalizadas de todas las recetas consideradas;
- versión de la lista de básicos.

Para reducir exposición, las restricciones del hogar no incluyen la identidad
del miembro que las declaró. El snapshot no incluye campos de perfil que no
participen en la política.

Las entradas de receta incluyen ingredientes, cantidades, unidades,
alérgenos, dieta, franjas y perfil estacional. Junto con los lotes, fecha y
política permiten reproducir la evaluación aunque esos registros cambien
después. Este snapshot completo es aceptable para el catálogo local inicial;
si el catálogo crece hasta hacerlo costoso, su persistencia o paginación se
diseñará sin cambiar el evaluador.

## Filtros obligatorios

El filtrado ocurre antes del scoring:

1. Solo recetas reutilizables.
2. Exclusión por alergias y necesidades médicas efectivas del hogar.
3. Cumplimiento de dieta del solicitante.
4. Ingredientes obligatorios con identificador canónico resoluble para
   `cook_now`.

Si existen restricciones relevantes y una receta carece de cobertura completa
de ingredientes, perfil curado de alérgenos o metadatos de dieta, la receta se
excluye. También se excluye cuando el mapa por ingrediente o la etiqueta
defensiva de la receta intersectan una exclusión efectiva. Un fallo al obtener
los mapas de restricciones aborta toda la decisión: el sistema falla cerrado.

Una necesidad médica declarada que no tenga traducción determinista no se
ignora. Produce una decisión válida sin candidatas y la razón
`unsupported_household_restriction`, para que el consumidor pueda explicarlo
sin presentar una receta como segura.

Un ingrediente desconocido, una cantidad indefinida o una unidad no
convertible impide `cook_now`, pero puede producir una candidata
`shop_then_cook` con un faltante explicado.

## Disponibilidad y consumo estimado

La política compara cada ingrediente obligatorio con los lotes positivos del
hogar, resolviendo `coalesce(canonical_id, id)` y usando las conversiones de
unidades ya soportadas por el motor de inventario.

Para determinar qué caducidad aprovecharía una receta, simula la asignación de
cantidad mediante FEFO sin modificar inventario. La simulación:

- usa primero los lotes que consumiría el comando real;
- limita el uso a la cantidad requerida por la receta y sus raciones base;
- registra qué proporción procede de `priority` y `consume_soon`;
- no escribe lotes, eventos ni proyecciones.

Antes de calcular ratios, agrupa las líneas compatibles de una receta por
ingrediente canónico. Para cada ingrediente no básico calcula la proporción
cubierta, prioritaria y próxima sobre su cantidad requerida, siempre entre
`0` y `1`. Los componentes de receta son la media aritmética de esos ratios,
lo que evita sumar directamente gramos, mililitros y unidades. Una cantidad
indefinida aporta `0` y fuerza `shop_then_cook`.

No se implementan conversiones nuevas ni sustituciones en esta feature. Una
incompatibilidad queda reflejada como faltante.

## Política de ranking v1

La política ordena lexicográficamente para que varias señales menores no
puedan superar una prioridad mayor:

1. `cook_now` antes que `shop_then_cook`;
2. mayor proporción aprovechada de lotes `priority`;
3. mayor proporción aprovechada de lotes `consume_soon`;
4. afinidad con la estación actual;
5. coincidencia con la franja de comida;
6. mayor proporción disponible;
7. menos ingredientes faltantes;
8. `recipe_id` como desempate estable.

La receta principal se selecciona del primer grupo no vacío: `cook_now` y,
solo como fallback, `shop_then_cook`.

El DTO no comprime este orden en un `totalScore` opaco. Devuelve `rank` y el
desglose normalizado que lo justifica; ningún consumidor debe volver a ordenar
las candidatas.

Historial, coste, dificultad, nutrición y tiempo disponible quedan fuera de la
política v1. Podrán añadirse en versiones posteriores sin reinterpretar una
decisión antigua.

## Razones controladas

Cada candidata puede incluir:

- `ready_from_pantry`;
- `uses_priority_ingredients`;
- `uses_consume_soon_ingredients`;
- `seasonal_fit`;
- `meal_type_fit`;
- `requires_shopping`;
- `unknown_ingredient`;
- `unsupported_unit`.

Una decisión sin candidata segura incluye `no_safe_candidate`.
Una restricción no soportada usa `unsupported_household_restriction`.

Las razones son códigos de dominio. La traducción y presentación pertenecen a
Home o chat en fases posteriores.

## Contrato conceptual

```ts
type RecommendationMode = "cook_now" | "shop_then_cook";

type RecommendationReasonCode =
  | "ready_from_pantry"
  | "uses_priority_ingredients"
  | "uses_consume_soon_ingredients"
  | "seasonal_fit"
  | "meal_type_fit"
  | "requires_shopping"
  | "unknown_ingredient"
  | "unsupported_unit";

interface RecommendationScoreBreakdown {
  // Ratios entre 0 y 1; missingIngredientCount es un entero >= 0.
  priorityUsage: number;
  consumeSoonUsage: number;
  seasonalAffinity: number;
  mealTypeMatch: number;
  availabilityRatio: number;
  missingIngredientCount: number;
}

interface RecommendationMissingIngredient {
  ingredientId: string | null;
  name: string;
  requiredQuantity: number | null;
  unit: string | null;
  reason: "missing" | "insufficient_quantity" | "unknown_ingredient" | "unsupported_unit";
}

interface RecommendationCandidate {
  recipeId: string;
  mode: RecommendationMode;
  rank: number;
  score: RecommendationScoreBreakdown;
  reasonCodes: RecommendationReasonCode[];
  usedBatchIds: string[];
  missingIngredients: RecommendationMissingIngredient[];
}

interface RecommendationInventoryBatchInput {
  batchId: string;
  canonicalIngredientId: string;
  remainingQuantity: number;
  unit: string | null;
  acquiredAt: string;
  expirationStatus: "fresh" | "consume_soon" | "priority" | null;
}

interface RecommendationRecipeIngredientInput {
  ingredientId: string | null;
  canonicalIngredientId: string | null;
  name: string;
  requiredQuantity: number | null;
  unit: string | null;
  safetyAllergens: string[] | null;
  safetyProfileVersion: string | null;
}

interface RecommendationRecipeInput {
  recipeId: string;
  allergens: string[] | null;
  diet: string[] | null;
  mealTypes: Array<"desayuno" | "almuerzo" | "merienda" | "cena">;
  seasons: Array<"spring" | "summer" | "autumn" | "winter" | "all_year">;
  seasonConfidence: "high" | "medium" | "low" | null;
  seasonSource: "curated" | "generated" | "backfill" | null;
  seasonClassifierVersion: string | null;
  ingredients: RecommendationRecipeIngredientInput[];
}

interface RecommendationSnapshot {
  householdId: string;
  requestingUserId: string;
  evaluatedAt: string;
  evaluationDate: string;
  season: "spring" | "summer" | "autumn" | "winter";
  mealType: "desayuno" | "almuerzo" | "merienda" | "cena" | null;
  policyVersion: string;
  assumedBasicsVersion: string;
  ingredientSafetyDatasetVersion: string;
  effectiveAllergens: string[];
  requiredDiet: string[];
  unsupportedHouseholdNeeds: string[];
  hasUnsupportedHouseholdNotes: boolean;
  inventoryBatches: RecommendationInventoryBatchInput[];
  recipeInputs: RecommendationRecipeInput[];
}

interface RecommendationDecision {
  policyVersion: string;
  evaluatedAt: string;
  season: "spring" | "summer" | "autumn" | "winter";
  mealType: "desayuno" | "almuerzo" | "merienda" | "cena" | null;
  selectedRecipeId: string | null;
  candidates: RecommendationCandidate[];
  decisionReason:
    | "selected_cook_now"
    | "selected_shop_then_cook"
    | "no_safe_candidate"
    | "unsupported_household_restriction";
  snapshot: RecommendationSnapshot;
}
```

El plan de implementación detallará la representación SQL snake_case sin
cambiar este contrato.

## Errores y degradación

- Error al cargar restricciones: abortar la decisión.
- Usuario sin hogar o sin membresía: abortar.
- Necesidad médica no mapeable: decisión vacía y explicable.
- Metadatos de seguridad incompletos con restricciones activas: excluir receta.
- Ingrediente o unidad no resoluble: degradar a `shop_then_cook`.
- Perfil estacional ausente: afinidad neutra.
- Perfil de caducidad ausente o lote fuera de ventana: no aporta urgencia.
- Ninguna receta segura: devolver decisión válida sin selección.

La degradación nunca convierte incertidumbre en una afirmación de seguridad o
disponibilidad.

## Seguridad y permisos

- Tablas globales de seguridad y estacionalidad con RLS y lectura para
  `authenticated`.
- DML de metadatos reservado a `service_role`.
- Evaluadores privados sin `EXECUTE` para `PUBLIC`, `anon` ni
  `authenticated`.
- RPC pública ejecutable solo por `authenticated`.
- Hogar derivado en servidor y filtrado explícito en todas las fuentes.
- Sin acceso del LLM a la RPC, al snapshot completo ni a SQL.

## Estrategia de pruebas

### Datos estacionales

- Dataset válido y reproducible.
- Vocabularios, confianza, procedencia y versiones cerrados.
- Clasificación de verano, invierno y `all_year`.
- Perfil ausente con contribución neutra.
- Pipeline de receta rechaza valores desconocidos.

### Datos de seguridad

- Dataset con cobertura exacta del seed y checksum reproducible.
- Lista vacía explícita diferenciada de perfil ausente.
- Rechazo de ingrediente, alérgeno o clave JSON duplicados.
- Preferencia canónica y fallback directo.
- DML global reservado a `service_role`.

### Filtros y autorización

- Alergia de otro miembro excluye una receta.
- Alérgeno derivado de un ingrediente excluye aunque falte en la etiqueta de
  receta.
- Perfil de seguridad ausente excluye cuando hay restricciones.
- Dieta de otro miembro no afecta al solicitante.
- Dieta del solicitante sí filtra.
- Metadatos de seguridad nulos fallan cerrado cuando corresponde.
- Dos miembros comparten inventario sin exponer otro hogar.
- Usuario externo no obtiene datos ni decisiones del hogar.

### Disponibilidad

- Cantidad suficiente e insuficiente.
- Conversiones soportadas.
- Unidad incompatible.
- Ingrediente desconocido.
- Sales y aceites comunes asumidos.
- Aceite específico tratado como obligatorio.
- Simulación FEFO sin escrituras.

### Ranking

- `cook_now` supera a cualquier `shop_then_cook`.
- Uso de `priority` supera a afinidad estacional.
- Uso de `consume_soon` supera a afinidad estacional.
- Receta veraniega gana el desempate en verano.
- Franja de comida rompe el siguiente empate.
- Orden estable por UUID en empate total.
- Mismo snapshot y `policyVersion` producen el mismo resultado.
- No existe ninguna llamada a IA.

### Contrato

- DTO SQL y TypeScript representan los mismos campos y códigos.
- `selectedRecipeId` coincide con la primera candidata del grupo elegido.
- `rank`, desglose y razones corresponden a la política declarada.
- Decisión vacía usa `no_safe_candidate`.
- Restricción no soportada usa `unsupported_household_restriction`.

## Orden de entrega

1. Plan de implementación de los tres slices.
2. Rama y PR de datos de seguridad por ingrediente.
3. Revisión, correcciones y merge.
4. Rama y PR de metadatos estacionales.
5. Revisión, correcciones y merge.
6. Rama nueva desde `main` para `RecommendationDecision`.
7. Evaluador, RPC, DTOs y pruebas.
8. Revisión, correcciones y merge.
9. Solo después, diseñar la migración de Home al nuevo DTO.

## Criterios de aceptación

- La clasificación estacional está persistida, versionada y validada.
- El mapa de alérgenos distingue cobertura curada de ausencia de datos.
- La política usa inventario del hogar y restricciones híbridas.
- La receta principal respeta el fallback `cook_now` → `shop_then_cook`.
- Caducidad domina estación y el orden es reproducible.
- Todas las candidatas incluyen desglose y razones suficientes.
- No hay decisiones de ranking en móvil, prompts o adaptadores de UI.
- Ninguna feature posterior comienza antes de validar y fusionar su PR previa.
