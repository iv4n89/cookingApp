# Fuentes y política de perfiles de ingredientes

## Alcance

El dataset `ingredient-allergens-es-v1` cubre los 331 `normalized_name` de
`supabase/migrations/0007_ingredients_seed.sql`. No usa los ingredientes de
`scripts/seed/recipes.json`, porque ese archivo solo contiene el subconjunto
presente en las 24 recetas iniciales.

La política modela únicamente estas exclusiones:

```text
gluten, crustaceans, molluscs, egg, fish, peanut, soy,
milk, nuts, celery, mustard, sesame, pork, alcohol
```

También modela incompatibilidad con `vegan` y `vegetarian`. `pork` y `alcohol`
son exclusiones de producto, no alérgenos regulatorios.

## Fuentes

### Reglamento (UE) 1169/2011

- URL:
  https://eur-lex.europa.eu/legal-content/ES/ALL/?uri=celex%3A32011R1169
- Uso: vocabulario y categorías del anexo II para los alérgenos soportados.
- Límite: el reglamento no demuestra la formulación de un producto genérico ni
  cubre las exclusiones de producto o dieta de RecetasApp.

### Guía de alérgenos de AESAN

- URL:
  https://www.aesan.gob.es/AECOSAN/docs/documentos/seguridad_alimentaria/gestion_riesgos/guia_aplicacion_informacion.pdf
- Uso: interpretación española de la información obligatoria sobre alérgenos.
- Límite: no se usa para inferir que una salsa, caldo, embutido o conserva
  genéricos estén libres de un alérgeno.

### Catálogo de RecetasApp

- Ruta: `supabase/migrations/0007_ingredients_seed.sql`.
- Uso: naturaleza explícita del ingrediente. Permite afirmar, por ejemplo, que
  un huevo contiene huevo, un pescado contiene pescado o un corte de cerdo es
  incompatible con dietas vegana y vegetariana.
- Límite: un nombre genérico no acredita marca, formulación, trazas ni proceso
  de fabricación.

## Estados de composición

### `exact_reviewed`

Se usa cuando el nombre identifica un ingrediente simple con atributos
intrínsecos suficientes para la política. Los arrays vacíos significan que no
se detectó ninguna coincidencia dentro del vocabulario soportado.

No significa ausencia universal de alérgenos. El dataset v1 no modela, entre
otros, sulfitos, altramuces ni contaminación cruzada.

### `variable_unknown`

Se usa para preparados sin formulación concreta: embutidos, panes, pastas,
quesos cuyo cuajo no está especificado, salsas, aceites aromatizados,
conservas y caldos genéricos.

Sus arrays recogen coincidencias explícitas conocidas por el nombre, pero no
son exhaustivos. Con cualquier exclusión o dieta obligatoria activa, el motor
de recomendación debe excluir la receta que contenga uno de estos perfiles.

## Decisiones conservadoras

- `nuts` representa la exclusión de producto «Frutos secos» de RecetasApp. Se
  incluyen piñón y castaña de forma conservadora aunque no formen parte de la
  lista de frutos de cáscara del anexo II.
- Avena, cebada, centeno y trigo se asignan a `gluten`.
- Marisco se mantiene separado en `crustaceans` y `molluscs`.
- Lácteos y huevo son incompatibles con `vegan`. Los quesos genéricos se
  mantienen `variable_unknown` porque el nombre no acredita el origen del
  cuajo. Carne, pescado y marisco son incompatibles con `vegan` y
  `vegetarian`.
- La miel es incompatible con `vegan`.
- Los vinagres no se clasifican como `alcohol`.
- `altramuz` no se traduce a otra clave: el vocabulario v1 no soporta lupino.
- Ningún ingrediente actual declara `alcohol`; la clave permanece versionada
  para futuras incorporaciones compatibles.

## Garantía y mantenimiento

Estos perfiles expresan compatibilidad con el modelo, no una certificación
alimentaria ni clínica. No cubren trazas, contaminación cruzada, cambios de
fabricante o tolerancias individuales.

Una modificación del catálogo exige:

1. añadir un perfil explícito;
2. revisar si la composición es exacta o variable;
3. adjuntar sus fuentes;
4. incrementar `datasetVersion` si cambia la semántica publicada;
5. regenerar y verificar la migración.
