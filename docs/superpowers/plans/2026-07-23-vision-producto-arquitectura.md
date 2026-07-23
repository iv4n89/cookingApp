# Plan: evolución hacia el copiloto de cocina

**Objetivo:** convertir la aplicación de recetas en un sistema de decisión doméstica: qué consumir, qué cocinar y qué comprar, con el backend como fuente de verdad y el LLM como intérprete y explicador.

**Decisión arquitectónica:** mantener Supabase (Postgres, Auth, RLS, Storage, Realtime y Edge Functions) como backend durante las fases de producto. No introducir microservicios ni una infraestructura cloud adicional hasta que existan trabajos durables, integraciones externas o carga que lo requieran.

## Estado de partida

La base actual ya ofrece autenticación, RLS, catálogo canónico de ingredientes, despensa y compra individuales, operaciones transaccionales de compra/cocinado, recomendaciones SQL y un pipeline de recetas con IA aislada en Edge Functions.

No obstante, todavía hay decisiones de dominio en el móvil (`apps/mobile/src/lib/pantry-match.ts`, `shopping-plan.ts` y los CRUD de `lib/`), el chat deja que el LLM proponga opciones antes del ranking, y faltan hogar, eventos de inventario, caducidad, planificación y sincronización.

## Principios y seams objetivo

1. **Inventario**: registra hechos de dominio; su estado es una proyección de esos hechos.
2. **Recomendación**: recibe una foto de estado y devuelve candidatos, puntuación, razones y versión de política. Nunca conversa.
3. **Conversación**: transforma mensaje en intención y explica una decisión ya calculada; no consulta libremente la base ni inventa el ranking.
4. **Planificación**: consume inventario, recomendaciones e historial; no modifica la despensa sin un comando explícito.
5. **Móvil**: usa DTOs y comandos de los casos de uso. Puede suscribirse a read models bajo RLS, pero no calcula matching, descuentos ni reglas de compra.
6. **IA**: es un adapter intercambiable. La generación es el último fallback y toda recomendación debe poder repetirse sin ella.

La primera implementación puede usar RPCs transaccionales para comandos y Edge Functions para composición, secretos e IA. Dos adapters reales justificarán formalizar puertos; antes de eso no añadir capas que solo deleguen.

---

## Fase 0 — Contrato de dominio y red de seguridad (local)

### Implementar

- Crear un glosario y ADR de los conceptos `Household`, `Membership`, `InventoryEvent`, `PantryBatch`, `ExpirationProfile`, `RecommendationDecision` e `Conversation`.
- Actualizar `packages/shared/src/types.ts` para que sea el contrato de DTOs de backend, no una copia incompleta del esquema inicial.
- Definir comandos explícitos e idempotentes: registrar compra, ajustar inventario, cocinar, deshacer, añadir a compra y completar compra.
- Crear una base de pruebas de migraciones/RLS/RPC y Edge Functions; añadir fixtures reproducibles para catálogo, usuario y despensa.
- Inventariar y clasificar cada acceso de `apps/mobile/src/lib/` como lectura de proyección o comando de dominio que debe emigrar al backend.

### Referencias que se deben copiar

- Patrón de comando transaccional: `supabase/migrations/0019_buy_shopping_items.sql` y `0029_uncook_restore_missing.sql`.
- Fuente única de reglas: `supabase/migrations/0033_preference_maps.sql`.
- Límites, autenticación y secretos: `supabase/functions/_shared/{auth,db,http}.ts`.

### Verificación

- `supabase db reset` aplica todas las migraciones y carga fixtures.
- Pruebas demuestran que RLS impide leer/escribir datos de otro usuario y que repetir un comando con la misma idempotency key no duplica efectos.
- `pnpm lint`, `pnpm typecheck` y `deno check` de las funciones modificadas pasan.

### Guardas

- No crear un repositorio/servicio por tabla: los seams son casos de uso, no wrappers CRUD.
- No permitir que el móvil envíe deltas de stock decididos por él como verdad de dominio.

---

## Fase 1 — Motor de inventario fiable (local)

### Implementar

- Modelar `households` y `household_members` con roles; migrar la propiedad de despensa y lista desde usuario a hogar, conservando la experiencia de un usuario como hogar personal inicial.
- Añadir `inventory_events` inmutable (compra, consumo, ajuste, corrección, desperdicio) y `pantry_batches` con ingrediente canónico, cantidad, unidad, fecha de compra/apertura, procedencia y confianza.
- Mantener `pantry_items` como read model/proyección compatible mientras se migra la UI; reconstruible desde eventos y lotes.
- Mover al backend la resolución canónica, elección de lotes a consumir (FEFO) y la actualización de compra/despensa. El comando de cocinado recibe receta y raciones, no `p_deltas` del cliente.
- Registrar la procedencia de cada cambio para poder deshacerlo y explicarlo.

### Referencias que se deben copiar

- Canonicalización: `0027_ingredients_canonical.sql`, `0030_ingredient_aliases.sql` y `_shared/recipes.ts`.
- Deshacer y atomía: `apply_cook` / `uncook_recipe` de `0029_uncook_restore_missing.sql`.

### Verificación

- Dos miembros autorizados ven el mismo inventario; un usuario ajeno no.
- Compra, cocinado, corrección y reintento concurrente dejan un ledger coherente y un stock no negativo.
- Una proyección regenerada desde eventos coincide con la despensa visible.

### Guardas

- No borrar historial de inventario para “corregir” estado; usar eventos de corrección.
- No implementar sincronización offline compleja todavía: primero comandos idempotentes y conflictos explícitos.

---

## Fase 2 — Caducidad y decisión reproducible (local)

### Implementar

- Añadir `expiration_profiles` por ingrediente/formato/almacenamiento y calcular ventanas estimadas, no falsas fechas exactas.
- Exponer estados `fresh`, `consume_soon` y `priority` con fecha estimada, confianza y explicación.
- Enriquecer el catálogo de recetas de forma estructurada: dificultad, cocina, método, coste estimado, nutrición, utensilios, temporada, meal prep, congelable y raciones; conservar `ingredients` JSON solo mientras haya una migración segura a relaciones/read models.
- Sustituir `recommended_recipes(...)` por un caso de uso que devuelva un `RecommendationDecision`: snapshot de entrada, candidatos, desglose de score, razones, versión de política y receta elegida.
- Incorporar de forma incremental disponibilidad, caducidad, preferencias/alérgenos, tiempo, faltantes, historial, coste y dificultad. Persistir decisiones solo para auditoría/telemetría, no como una nueva fuente de verdad.
- Hacer que Home consuma un único DTO “decisión de hoy”: productos prioritarios, recetas para aprovecharlos y acciones de compra.

### Referencias que se deben copiar

- Ranking determinista existente: `recommended_recipes` en `0033_preference_maps.sql`.
- Filtros seguros: `_shared/preferences.ts`.
- Diversidad semántica y embeddings: `0034_find_similar_recipe.sql` y `match_recipes`.

### Verificación

- Con el mismo snapshot y versión de política, la recomendación y su desglose son idénticos sin llamar a un LLM.
- Una receta incompatible con alergias nunca entra en candidatos; ante fallo del filtro, el caso de uso falla cerrado.
- Fixtures prueban que caducidad alta supera a coincidencia superficial de despensa.

### Guardas

- No mover scoring a prompts ni duplicarlo entre SQL, TypeScript y móvil.
- No afirmar precisión nutricional, de precio o de caducidad sin fuente y nivel de confianza explícitos.

---

## Fase 3 — Motor conversacional delgado y recetas como fallback (local)

### Implementar

- Definir un DTO de intención (`ask_recommendation`, `find_recipe`, `adapt_recipe`, `question`, `plan_week`) y validar su salida estructurada.
- Cambiar `chat` para ejecutar primero el motor de recomendación/búsqueda y entregar al LLM solo intención, top-N, razones, restricciones y conversación acotada.
- Eliminar `suggestions` inventadas por el LLM; las opciones deben ser recetas reales del motor.
- Corregir el pipeline para respetar el orden: receta existente → adaptación de receta existente → generación solo sin candidatas válidas.
- Encapsular Gemini tras un adapter de IA con contratos para chat, embedding, generación y resolución de ingredientes; introducir un segundo proveedor solo cuando sea una necesidad real.
- Añadir propiedad y RLS correcta a recetas personalizadas, separándolas del catálogo reutilizable si procede.

### Referencias que se deben copiar

- Pipeline central: `supabase/functions/_shared/recipe-pipeline.ts`.
- Validación de respuesta y límites: `supabase/functions/chat/index.ts` y `_shared/gemini.ts`.
- Control de preferencias: `_shared/preferences.ts`.

### Verificación

- Una petición de ideas devuelve IDs de recetas persistidas y el score que las justificó.
- El LLM no recibe acceso a SQL ni una despensa completa sin reducir; los logs muestran candidatos y versión de política.
- Sin credenciales de IA, Home y las recomendaciones existentes siguen funcionando.

### Guardas

- No codificar reglas de negocio en el prompt.
- No usar `skipCache` para saltarse por defecto la prioridad de recetas existentes.

---

## Fase 4 — Compra compartida, planificación y ciclo diario (local)

### Implementar

- Introducir entidad de lista, items compartidos y eventos de compra ligados a `household_id`.
- Activar Supabase Realtime sobre read models de despensa y lista, con reconexión, idempotencia y refresco de reconciliación.
- Crear el plan semanal como propuesta editable derivada de recomendaciones, caducidad, raciones y restricciones; confirmarlo genera comandos, no cambios implícitos.
- Añadir métricas locales de desperdicio, consumo y agotamiento basadas exclusivamente en eventos con su nivel de confianza.
- Preparar el contrato de ingreso de ticket: documento, líneas detectadas, confianza, propuesta y confirmación humana. Implementar inicialmente solo la confirmación manual/fixtures.

### Referencias que se deben copiar

- Movimiento compra→despensa: `buy_shopping_items` en `0019_buy_shopping_items.sql`.
- Configuración de Realtime local: `supabase/config.toml` (`[realtime]`).

### Verificación

- Dos sesiones del mismo hogar convergen tras compras, ediciones y cocinados; los conflictos se ven y no pierden eventos.
- Un plan no altera inventario hasta que el usuario confirma cocinar/comprar.
- Una línea de ticket no confirmada no modifica stock.

### Guardas

- No procesar tickets automáticamente sin revisión de cantidades/unidades al principio.
- No convertir Realtime en fuente de verdad: Postgres y los comandos siguen siéndolo.

---

## Fase 5 — Preparación cloud y operación (cuando se abra infraestructura remota)

### Implementar

- Crear proyectos Supabase separados para staging y producción; aplicar migraciones por CI, gestionar secretos por entorno y verificar `verify_jwt`, redirects OAuth, buckets y policies remotos.
- Configurar backups, restauración probada, límites de Auth/API, auditoría de RLS, logs estructurados, trazas, alertas de errores/coste y paneles de métricas.
- Desplegar Edge Functions con secretos de IA; proteger endpoints internos, webhooks de RevenueCat y rotar credenciales.
- Añadir un scheduler/cola durable para reintentos, caducidades, notificaciones, imágenes, embeddings y recomputación de recomendaciones. `EdgeRuntime.waitUntil` solo queda como optimización, no como garantía.
- Integrar almacenamiento privado, OCR/document AI y revisión de tickets como pipeline asíncrono con estados, reintentos y dead-letter.
- Incorporar push notifications, analítica con consentimiento y feature flags/experimentos del scoring.

### Verificación

- Restauración desde backup en staging y despliegue reversible de migraciones compatibles.
- Pruebas e2e contra staging comprueban JWT, RLS de hogares, webhooks firmados, jobs reintentables y ausencia de secretos en clientes.
- Alarmas de error, cola atascada y coste de IA se prueban mediante simulación.

### Guardas

- No lanzar OCR, notificaciones ni trabajos críticos desde una Edge Function sin cola durable.
- No habilitar un proveedor de IA o pago en producción sin límites, observabilidad y procedimiento de rotación.

---

## Fase 6 — Integraciones y escala (solo con evidencia de necesidad)

### Implementar

- Integraciones de supermercados/precios, únicamente con fuente contractual y cobertura verificable.
- Predicción de agotamiento y desperdicio cuando exista histórico suficiente y métricas de calidad.
- Extraer un servicio de recomendación solo si los perfiles de consulta, experimentación o volumen dejan de encajar en Postgres/RPC; conservar el mismo contrato `RecommendationDecision`.

### Verificación

- Cada integración tiene procedencia, fecha de actualización, cobertura y fallback sin romper las decisiones básicas.
- Los modelos predictivos se comparan con baseline determinista y se pueden desactivar.

### Guardas

- No diseñar microservicios por anticipación.
- No presentar precios, nutrición o predicciones como hechos si son estimaciones.

---

## Orden de entrega recomendado

1. Fase 0 completa y aprobada.
2. Fase 1 antes de familia, tickets o sincronización.
3. Fase 2 antes de rediseñar Home y chat.
4. Fase 3 antes de ampliar capacidades de IA.
5. Fase 4 para cerrar el ciclo doméstico local.
6. Fases 5 y 6 solo al operar datos reales y dependencias externas.

## Decisiones de producto que se deben cerrar antes de ejecutar cada bloque

- Si un hogar comparte exactamente una despensa/lista o conserva inventarios individuales agregables.
- Política de caducidad: categorías, ubicación, apertura, formato y tratamiento de la incertidumbre.
- Fuente y responsabilidad legal de nutrición, alérgenos, precios y datos de supermercado.
- Alcance de tickets: proveedor OCR, retención de imágenes, revisión humana y privacidad.
- Qué acciones puede automatizar el sistema y cuáles exigen confirmación explícita.
