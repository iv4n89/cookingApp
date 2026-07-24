# Tanda de recetas cotidianas sencillas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir ~50 recetas cotidianas sencillas (≤6 ingredientes, español/mediterráneo, ancladas a proteínas + despensa común) al catálogo, para que la Home pueda destacar recetas cocinables con lo que se tiene.

**Architecture:** Es una tanda de DATOS, sin cambios de código. Se amplían dos ficheros JSON emparejados (`scripts/seed/recipes.json` y `scripts/seed/recipe-season-profiles.json`) y se siembran con `scripts/seed/seed-recipes.mjs`, que los envía a la Edge Function `index-recipe` (embeddea, deduplica a 0,9, difiere la imagen).

**Tech Stack:** JSON de datos, Node (script de siembra), Supabase Edge Functions + Postgres.

Spec: `docs/superpowers/specs/2026-07-24-catalog-everyday-recipes-design.md`. La lista de ~50 títulos aprobada está en el spec.

---

## Contrato de datos (leer antes de empezar)

**`scripts/seed/recipes.json`** es un array. Cada receta:
```json
{
  "title": "Cerdo con patatas",
  "description": "Guiso sencillo de cerdo con patatas y cebolla, de toda la vida.",
  "servings": 4,
  "prep_time_min": 15,
  "cook_time_min": 40,
  "calories": 480,
  "tags": ["española", "guiso", "casera"],
  "allergens": [],
  "diet": [],
  "meal_types": ["almuerzo", "cena"],
  "ingredients": [
    { "name": "Carne de cerdo", "quantity": 600, "unit": "g", "substitutions": [] },
    { "name": "Patata", "quantity": 500, "unit": "g", "substitutions": [] },
    { "name": "Cebolla", "quantity": 1, "unit": "ud", "substitutions": [] },
    { "name": "Ajo", "quantity": 2, "unit": "diente", "substitutions": [] },
    { "name": "Aceite de oliva", "quantity": 30, "unit": "ml", "substitutions": [] },
    { "name": "Sal", "quantity": null, "unit": null, "substitutions": [] }
  ],
  "steps": [
    { "order": 1, "instruction": "Dora la carne de cerdo troceada con un poco de aceite.", "timerSeconds": null },
    { "order": 2, "instruction": "Añade la cebolla y el ajo picados y pocha unos minutos.", "timerSeconds": 300 },
    { "order": 3, "instruction": "Incorpora las patatas en trozos, cubre con agua y sal, y cuece hasta que estén tiernas.", "timerSeconds": 1500 }
  ]
}
```

**`scripts/seed/recipe-season-profiles.json`** es `{ "classifierVersion": "...", "profiles": [ ... ] }`. Cada perfil:
```json
{ "title": "Cerdo con patatas", "seasons": ["all_year"], "confidence": "medium", "source": "curated" }
```

Reglas duras:
- **Emparejamiento exacto**: para CADA receta añadida a `recipes.json` debe existir UN perfil con el MISMO `title` en `recipe-season-profiles.json`. El sembrador lanza `Los perfiles estacionales no coinciden exactamente con recipes.json` si el nº de perfiles ≠ nº de recetas o falta algún título. Los títulos deben ser únicos.
- **allergens/diet/meal_types** usan vocabulario cerrado. Alérgenos válidos (los que apliquen): `egg, milk, gluten, fish, crustaceans, molluscs, nuts, peanut, soy, sesame, mustard, celery, sulphites, lupin`. Diet: `vegetarian`, `vegan` (deja `[]` si es omnívora).
- **`meal_types`**: AÑÁDELO a cada receta (las 24 existentes lo omiten, pero `saveRecipe` lo persiste y mejora la relevancia por franja). Usa las claves `desayuno`, `almuerzo`, `merienda`, `cena`; una receta puede tener varias. Guía: platos de comida principal → `["almuerzo","cena"]`; tostadas/yogur/tortitas/pan → `["desayuno","merienda"]`; bocadillos/ensaladas ligeras → `["almuerzo","merienda","cena"]`. Añade el campo `"meal_types": [...]` al objeto de la receta (no a los perfiles estacionales).
- **≤6 ingredientes** por receta, contando básicos. Prioriza que los NO básicos (todo salvo sal/aceite/agua) sean 3-4 y de despensa común.
- **Nombres de ingredientes**: usa nombres que YA existan en el catálogo canónico para evitar creaciones. Antes de redactar cada lote, obtén los nombres reales:
  `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc "select name from public.ingredients where normalized_name = ANY(array['carne de cerdo','patata','cebolla','ajo','aceite de oliva','sal','pollo','huevo','arroz','tomate','lenteja','garbanzo']) order by name"` y ajusta a los nombres que devuelva. Para dudas, busca por `ilike`.
- `allergens` debe reflejar los ingredientes reales: huevo→`egg`, leche/queso/nata→`milk`, pescado→`fish`, marisco→`crustaceans`/`molluscs`, gluten (pan/pasta/harina/rebozados)→`gluten`, frutos secos→`nuts`, etc.

---

## File Structure

- Modify: `scripts/seed/recipes.json` — añadir ~50 recetas al array (quedan las 24 + ~50).
- Modify: `scripts/seed/recipe-season-profiles.json` — añadir el perfil de cada nueva receta al array `profiles`.

Las tareas de autoría se hacen por lotes; tras CADA lote los dos ficheros deben quedar sincronizados (mismos títulos) y ser JSON válido.

---

### Task 1: Lote 1 — Carnes (Cerdo, Pollo, Ternera)

**Files:**
- Modify: `scripts/seed/recipes.json`
- Modify: `scripts/seed/recipe-season-profiles.json`

Títulos (del spec): Cerdo con patatas · Lomo de cerdo a la plancha con cebolla · Magro con tomate · Salchichas frescas con pimientos · Pollo al ajillo · Pechuga de pollo a la plancha con limón · Muslos de pollo al horno con patatas · Arroz con pollo sencillo · Ternera guisada con guisantes · Filete de ternera a la plancha · Albóndigas en salsa de tomate.

- [ ] **Step 1: Obtener nombres canónicos**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc "select name from public.ingredients where category in ('Carnes','Verduras y hortalizas','Cereales, pan y pasta') order by name" | head -80`
Usa esos nombres exactos en los ingredientes.

- [ ] **Step 2: Redactar las 11 recetas**

Añade las 11 recetas al array de `scripts/seed/recipes.json`, cada una siguiendo el contrato (schema del ejemplo "Cerdo con patatas" de arriba): ≤6 ingredientes, español/mediterráneo, pasos reales con `order` correlativo y `timerSeconds` (segundos o null), `allergens` según ingredientes, `diet` `[]` (son con carne), tiempos y calorías realistas. Cada receta ancla su proteína + básicos de despensa.

- [ ] **Step 3: Añadir los 11 perfiles estacionales**

Por cada título, añade a `profiles` de `scripts/seed/recipe-season-profiles.json`: `{ "title": "<mismo título>", "seasons": ["all_year"], "confidence": "medium", "source": "curated" }`. (Usa `["all_year"]` salvo que un plato sea claramente estacional.)

- [ ] **Step 4: Validar JSON y sincronía**

Run:
```
node -e "const r=require('./scripts/seed/recipes.json'); const s=require('./scripts/seed/recipe-season-profiles.json'); const rt=new Set(r.map(x=>x.title)); const st=new Set(s.profiles.map(x=>x.title)); const miss=[...rt].filter(t=>!st.has(t)); const extra=[...st].filter(t=>!rt.has(t)); console.log('recetas',r.length,'perfiles',s.profiles.length,'sin_perfil',miss,'sin_receta',extra); const over=r.filter(x=>x.ingredients.length>6).map(x=>x.title); console.log('con_mas_de_6_ingredientes', over);"
```
Expected: `recetas` y `perfiles` iguales; `sin_perfil` y `sin_receta` vacíos; `con_mas_de_6_ingredientes` vacío.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed/recipes.json scripts/seed/recipe-season-profiles.json
git commit -m "data: recetas cotidianas de carne (lote 1)"
```

---

### Task 2: Lote 2 — Huevo y Pescado

**Files:** los mismos dos JSON.

Títulos: Tortilla francesa · Huevos fritos con patatas · Huevos rotos con jamón · Revuelto de setas · Revuelto de ajetes · Merluza a la plancha con verduras · Salmón al horno con limón · Bacalao con tomate · Sardinas a la plancha · Ensalada de atún · Boquerones fritos.

- [ ] **Step 1: Nombres canónicos de pescados/lácteos**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc "select name from public.ingredients where category in ('Pescados y mariscos','Lácteos y huevos') order by name"`

- [ ] **Step 2: Redactar las 11 recetas** siguiendo el contrato. `allergens`: los de huevo→`egg`, pescado→`fish`, jamón (gluten no; cerdo sí como ingrediente pero no hay clave de cerdo en alérgenos — omitir), boquerones/rebozados con harina→`gluten` si llevan rebozado.

- [ ] **Step 3: Añadir los 11 perfiles estacionales** (`all_year`, `medium`, `curated`; sardinas/boquerones pueden ser `["summer"]` si procede).

- [ ] **Step 4: Validar** con el mismo comando `node -e ...` del Task 1 Step 4. Expected: sincronía OK, ninguna con >6 ingredientes.

- [ ] **Step 5: Commit**
```bash
git add scripts/seed/recipes.json scripts/seed/recipe-season-profiles.json
git commit -m "data: recetas cotidianas de huevo y pescado (lote 2)"
```

---

### Task 3: Lote 3 — Legumbres, Arroz y Pasta

**Files:** los mismos dos JSON.

Títulos: Lentejas estofadas · Garbanzos con espinacas · Alubias con chorizo · Potaje de garbanzos · Judías verdes con jamón · Arroz a la cubana · Arroz blanco con tomate · Macarrones con tomate · Espaguetis al ajillo · Pasta con atún y tomate.

- [ ] **Step 1: Nombres canónicos** de legumbres/cereales: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc "select name from public.ingredients where category in ('Legumbres','Cereales, pan y pasta') order by name"`
- [ ] **Step 2: Redactar las 10 recetas** (contrato). `allergens`: pasta/macarrones/espaguetis→`gluten`; atún→`fish`.
- [ ] **Step 3: Añadir los 10 perfiles** (`all_year`, `medium`, `curated`).
- [ ] **Step 4: Validar** (comando del Task 1 Step 4). Expected: sincronía OK, ninguna >6.
- [ ] **Step 5: Commit**
```bash
git add scripts/seed/recipes.json scripts/seed/recipe-season-profiles.json
git commit -m "data: recetas cotidianas de legumbres, arroz y pasta (lote 3)"
```

---

### Task 4: Lote 4 — Verduras y Sopas

**Files:** los mismos dos JSON.

Títulos: Pisto de verduras · Menestra de verduras · Verduras al horno · Puré de patata · Crema de calabacín · Espinacas rehogadas · Ensalada mixta · Sopa de fideos · Sopa de verduras · Gazpacho.

- [ ] **Step 1: Nombres canónicos** de verduras: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc "select name from public.ingredients where category = 'Verduras y hortalizas' order by name"`
- [ ] **Step 2: Redactar las 10 recetas**. Muchas son `vegetarian`/`vegan` (márcalo en `diet`: puré con leche→`vegetarian`; pisto/gazpacho/verduras al horno sin lácteos→`vegan`). Sopa de fideos→`gluten`. Crema de calabacín con nata/queso→`milk` + `vegetarian`.
- [ ] **Step 3: Añadir los 10 perfiles**. Gazpacho→`["summer"]`; el resto `["all_year"]`.
- [ ] **Step 4: Validar** (comando del Task 1 Step 4).
- [ ] **Step 5: Commit**
```bash
git add scripts/seed/recipes.json scripts/seed/recipe-season-profiles.json
git commit -m "data: recetas cotidianas de verduras y sopas (lote 4)"
```

---

### Task 5: Lote 5 — Desayuno y merienda

**Files:** los mismos dos JSON.

Títulos: Tostada con tomate y aceite · Tostada de aguacate · Yogur con fruta y miel · Tortitas sencillas · Bocadillo de tortilla francesa · Pan con chocolate.

- [ ] **Step 1: Nombres canónicos** de pan/fruta/lácteos: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc "select name from public.ingredients where category in ('Cereales, pan y pasta','Frutas','Lácteos y huevos') order by name"`
- [ ] **Step 2: Redactar las 6 recetas**. `allergens`: pan/tostada/bocadillo/tortitas→`gluten`; yogur/tortitas con leche→`milk`; tortilla/tortitas con huevo→`egg`. `diet`: yogur/tostada→`vegetarian`; tostada de tomate/aguacate sin lácteos→`vegan`.
- [ ] **Step 3: Añadir los 6 perfiles** (`all_year`, `medium`, `curated`).
- [ ] **Step 4: Validar** (comando del Task 1 Step 4). Deben quedar ~74 recetas totales (24 + 50) y perfiles iguales.
- [ ] **Step 5: Commit**
```bash
git add scripts/seed/recipes.json scripts/seed/recipe-season-profiles.json
git commit -m "data: recetas cotidianas de desayuno y merienda (lote 5)"
```

---

### Task 6: Sembrar en local

**Files:** ninguno (ejecución).

- [ ] **Step 1: Asegurar Edge Functions servidas**

Comprueba que `index-recipe` responde. Si no hay un `supabase functions serve` activo, arráncalo en background:
`supabase functions serve --env-file supabase/functions/.env`
(Ese `.env` tiene `GEMINI_API_KEY` e `INTERNAL_FUNCTION_SECRET`, necesarios para embeddear y autenticar.)

- [ ] **Step 2: Ejecutar la siembra**

Con las variables de entorno (obtén anon key y URL de `supabase status`; el secreto interno de `supabase/functions/.env`):
```
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY="<anon key de supabase status>" \
INTERNAL_FUNCTION_SECRET="<INTERNAL_FUNCTION_SECRET de supabase/functions/.env>" \
node scripts/seed/seed-recipes.mjs
```
Expected: no lanza el error de emparejamiento; imprime un resumen con recetas sembradas (`ok`) y deduplicadas. Las 24 originales saldrán deduplicadas; las nuevas mayormente `ok`.

- [ ] **Step 3: Verificar inserción**

Run:
```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc "select count(*) from public.recipes where reusable and jsonb_array_length(ingredients) <= 6"
```
Expected: bastante mayor que antes (antes había 37 recetas con ≤6 ingredientes; deben aparecer decenas más). Comprueba también que existen títulos nuevos:
```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc "select title, jsonb_array_length(ingredients) from public.recipes where title in ('Cerdo con patatas','Pollo al ajillo','Lentejas estofadas')"
```
Expected: aparecen (o su variante deduplicada). Si "Cerdo con patatas" NO aparece (dedup lo fusionó con una compleja), anótalo: puede requerir ajustar el título/descripcion para diferenciarlo, o bajar el umbral no procede.

---

### Task 7: Verificar el escenario clave

**Files:** ninguno (verificación).

- [ ] **Step 1: Montar despensa de prueba y evaluar**

Usa el hogar de `servings@test.local` (user `30383ee5-26d4-4822-a373-4c4ed0144457`). Asegúrate de que tiene cerdo (dentro de plazo o priority), patata y cebolla (ya los tiene de sesiones anteriores). Evalúa:
```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" <<'SQL'
begin;
select set_config('request.jwt.claim.sub','30383ee5-26d4-4822-a373-4c4ed0144457',true);
select set_config('request.jwt.claim.role','authenticated',true);
select
  (c->>'rank')::int as rango, r.title, c->>'mode' as modo,
  (c->'score'->>'missingIngredientCount')::int as faltan, ('cerdo'=any(r.tags)) as usa_cerdo
from (select public.household_recommendation_decision('cena',30) d) t,
  jsonb_array_elements(d->'candidates') c join public.recipes r on r.id=(c->>'recipeId')::uuid
order by rango limit 8;
rollback;
SQL
```
Expected: entre las primeras candidatas aparece ahora una receta de cerdo SENCILLA (p. ej. "Cerdo con patatas") en `cook_now` o con ≤2 faltantes, por delante o a la altura de la tortilla. Antes la primera de cerdo estaba en el puesto 5 con 3 faltantes.

- [ ] **Step 2: Confirmar en el DTO de la Home**

```
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" <<'SQL'
begin;
select set_config('request.jwt.claim.sub','30383ee5-26d4-4822-a373-4c4ed0144457',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.household_today_decision('cena',5)->'pantry'->'featured'->>'title' as destacada;
rollback;
SQL
```
Expected: idealmente la destacada aprovecha el cerdo; si aún gana otra con menos faltantes, al menos una receta de cerdo sencilla está entre las alternativas de `pantry`. Documenta el resultado real.

---

### Task 8: PR + revisión + merge

- [ ] **Step 1: Prueba en móvil (opcional)**: con los servidores levantados, abrir la Home y comprobar que "Aprovecha tu despensa" muestra recetas cocinables sencillas.
- [ ] **Step 2: Push, `gh pr create`**, revisión con `code-reviewer` centrada en: JSON válido, sincronía receta↔perfil, ≤6 ingredientes, `allergens`/`diet` correctos por ingrediente, nombres resolubles al catálogo. Corregir en la rama y re-revisar.
- [ ] **Step 3: Merge con confirmación del usuario** (squash + borrar rama), `git switch main && git pull`.

---

## Notas

- Es una tanda de datos: no hay tests unitarios; la "prueba" es la validación de JSON/sincronía (Task N Step 4), la siembra (Task 6) y el escenario clave (Task 7).
- Reejecutar la siembra es idempotente por el dedup del servidor.
- Si al sembrar el embedding/resolver de Gemini agota cuota (free-tier), reduce el ritmo o siembra en dos pasadas; el dedup evita duplicados al reintentar.
