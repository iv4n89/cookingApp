# Diseño: perfiles aproximados de caducidad

## Objetivo

Crear un dataset JSON reproducible para los 331 ingredientes canónicos definidos
en `supabase/migrations/0007_ingredients_seed.sql`. El dataset permitirá estimar
qué alimentos conviene consumir y priorizar recetas que los aprovechen, sin pedir
al usuario fechas, ubicación ni estado de apertura.

La fecha de entrada de un lote en la despensa es el único dato temporal de
entrada. Las estimaciones sirven para ordenar decisiones de producto; no
constituyen una fecha de seguridad alimentaria ni deben presentarse como una
caducidad exacta.

## Alcance

- Investigar rangos de conservación para los 331 canónicos.
- Guardar el resultado en
  `packages/shared/src/data/ingredient-expiration-profiles.json`.
- Reutilizar perfiles cuando varios ingredientes tengan un comportamiento
  equivalente.
- Conservar la fuente, la confianza y el tipo de correspondencia de cada dato.
- Validar que todos los canónicos aparecen exactamente una vez y que cada
  referencia de perfil es válida.

No se implementan en este slice la tabla Postgres `expiration_profiles`, el
motor de estados, el ranking de recetas ni cambios en Home. El JSON será el
dataset de entrada para esos trabajos posteriores de la Fase 2.

## Principios de producto

1. El usuario no introduce una fecha de caducidad.
2. El usuario no indica si el alimento está abierto.
3. El usuario no indica dónde está almacenado.
4. El reloj comienza cuando el alimento entra en la despensa.
5. La interfaz mostrará estados cualitativos, no una fecha exacta.
6. El objetivo de la estimación es priorizar alimentos y recetas, no certificar
   que un alimento sea seguro para consumir.

## Fuente y metodología

La fuente principal será **FSIS FoodKeeper Data**, publicada por el Food Safety
and Inspection Service del USDA:

- Catálogo: <https://catalog.data.gov/dataset/fsis-foodkeeper-data>
- Dataset en español:
  <https://www.fsis.usda.gov/shared/data/ES/foodkeeper.json>
- Tabla oficial de conservación en frío:
  <https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts>

FoodKeeper es un dataset público CC0 y ofrece rangos, en lugar de una falsa
fecha exacta. La versión consultada figura como actualizada el 22 de enero de
2025 en Data.gov. El contenido español inspeccionado identifica su versión
interna como 128, generada desde `FMA-Data-v128.xlsx`, con fecha de modificación
declarada 6 de septiembre de 2018. Ambos metadatos se conservarán por separado
para no presentar una actualización del catálogo como una revisión científica
del contenido.

El mapeo se realizará con esta prioridad:

1. **Directo**: FoodKeeper contiene el alimento o un sinónimo inequívoco.
2. **Familia**: se aplica un perfil oficial de la misma familia y forma
   alimentaria; por ejemplo, piezas de pollo fresco.
3. **Fallback**: se usa una estimación conservadora de categoría cuando la
   fuente no permite una equivalencia más precisa.

Las variedades que no alteran de forma material la conservación compartirán
perfil. No se inventarán diferencias entre, por ejemplo, variedades de arroz o
tipos equivalentes de cebolla.

Aunque la fuente distinga despensa, refrigeración y congelación, la ubicación no
formará parte del modelo. Durante la investigación se elegirá la conservación
doméstica habitual implícita en el nombre del alimento. Un ingrediente solo
recibirá un comportamiento distinto si su propio nombre lo expresa, como podría
ocurrir con un producto congelado.

## Estructura del JSON

```json
{
  "schemaVersion": 1,
  "catalog": {
    "source": "supabase/migrations/0007_ingredients_seed.sql",
    "canonicalCount": 331
  },
  "sources": {
    "foodkeeper": {
      "title": "FSIS FoodKeeper Data",
      "url": "https://catalog.data.gov/dataset/fsis-foodkeeper-data",
      "retrievedAt": "2026-07-23"
    }
  },
  "profiles": {
    "fresh-chicken": {
      "minDays": 1,
      "maxDays": 2,
      "confidence": "high",
      "sourceId": "foodkeeper",
      "sourceRef": "Chicken or turkey, pieces",
      "priorityEligible": true
    }
  },
  "ingredients": {
    "pechuga de pollo": {
      "profileId": "fresh-chicken",
      "match": "direct"
    },
    "muslo de pollo": {
      "profileId": "fresh-chicken",
      "match": "family"
    }
  }
}
```

### Reglas del esquema

- Las claves de `ingredients` son los `normalized_name` exactos del catálogo.
- En perfiles prioritizables, `minDays` y `maxDays` son enteros positivos y
  `minDays <= maxDays`.
- Si la fuente indica una duración indefinida, ambos rangos son `null` y
  `priorityEligible` debe ser `false`. No se inventa un número finito.
- `confidence` admite `high`, `medium` o `low`.
- `match` admite `direct`, `family` o `fallback`.
- `sourceId` debe existir en `sources`.
- `sourceRef` identifica la entrada o regla de la fuente que justifica el
  perfil.
- `priorityEligible` evita que productos estables como la sal generen
  recomendaciones absurdas por antigüedad. Esos productos siguen presentes en
  el catálogo y conservan un perfil trazable.

## Uso posterior

Un trabajo posterior calculará la edad del lote desde su fecha de entrada y
transformará el rango en los estados:

- `fresh`: primera parte de la ventana estimada.
- `consume_soon`: el lote se aproxima al límite inferior.
- `priority`: el lote ha alcanzado el límite inferior estimado.

Los umbrales exactos y el DTO de estado se diseñarán junto al motor de
caducidad. No forman parte de este dataset y no deben duplicarse dentro del
JSON.

El motor de recomendación podrá elevar recetas que utilicen lotes
`consume_soon` o `priority`, siempre después de aplicar alergias y restricciones
de seguridad.

## Validación

La validación automatizada debe comprobar:

1. El archivo es JSON válido.
2. `canonicalCount` coincide con los canónicos extraídos de la migración.
3. Las claves de `ingredients` coinciden exactamente con los 331
   `normalized_name`, sin ausencias, extras ni duplicados.
4. Todos los ingredientes apuntan a un perfil existente.
5. Todos los perfiles cumplen sus invariantes de rango, confianza y fuente.
6. Todo perfil está referenciado por al menos un ingrediente.

Se implementará como
`scripts/validate-expiration-profiles.mjs` y se ejecutará mediante un script
`validate:expiration-profiles` del `package.json` raíz.

Además se revisará manualmente una muestra representativa de:

- carne y pescado de vida corta;
- fruta y verdura;
- lácteos y huevos;
- pan, cereales y legumbres;
- conservas, aceites, condimentos y productos estables.

## Riesgos y mitigaciones

- **Falsa precisión**: se conservan rangos y confianza; la UI no mostrará una
  fecha exacta.
- **Variedades españolas sin entrada literal**: se documenta la equivalencia
  por familia o fallback.
- **Suposición de almacenamiento**: no se expone ni se convierte en estado de
  dominio; el rango representa el uso doméstico habitual asumido.
- **Datos desactualizados**: `schemaVersion`, fuente y fecha de consulta hacen
  revisable el dataset.
- **Uso como garantía de seguridad**: el contrato declara que las estimaciones
  sirven para priorización y no sustituyen el etiquetado ni la inspección del
  alimento.

## Criterios de aceptación

- Existe un JSON válido con cobertura exacta de los 331 canónicos.
- Cada ingrediente tiene rango trazable y nivel de confianza.
- No existen campos de fecha introducida, apertura ni ubicación.
- Los productos estables no pueden convertirse en prioridad de recetas.
- La comprobación automatizada de cobertura y referencias pasa.
