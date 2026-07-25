# Estado del proyecto y punto de reanudación

Última actualización: 25 de julio de 2026.

Este documento es la memoria operativa del roadmap. Al retomar el trabajo en
otro chat o editor, debe leerse antes del plan maestro:
`docs/superpowers/plans/2026-07-23-vision-producto-arquitectura.md`.

La visión de producto vigente está en `docs/vision_producto_app_cocina.md`.
El plan maestro ya está organizado alrededor de esa visión: motores de
inventario, recomendación, conversación y planificación, y el ciclo diario
comprar → despensa → prioritarios → recomendar → cocinar → actualizar.

## Estado resumido

| Fase del plan maestro | Estado | Entrega |
| --- | --- | --- |
| Fase 0 — Contrato de dominio y red de seguridad | Completada | PR #87, commit `15a50d9` |
| Fase 1 — Motor de inventario fiable | Completada y revisada | PR #88, commit de merge `10ebde9` |
| Fase 2 — Caducidad y decisión reproducible | Completada (Home + rework de recomendación) | Backend #90/#91/#93/#94/#95; Home #99/#100; rework #101-#106 |
| Fase 3 — Motor conversacional delgado | En curso (primer slice: chat catálogo-primero) | Chat #114; falta el resto |
| Fase 4 — Compra compartida y ciclo diario | Pendiente | Depende de Fase 3 |
| Fase 5 — Preparación cloud y operación | Demo entregada (alcance reducido) | Cloud + APK live; ops completa aplazada |
| Fase 6 — Integraciones y escala | Aplazada | Solo con evidencia de necesidad |

El primer slice de la Fase 2 construyó el dataset trazable de perfiles
aproximados de caducidad y su validador offline en la PR #90, fusionada como
`3dfb64a`. El segundo slice cargó esos datos en Postgres y añadió el snapshot
de estados por hogar en la PR #91, fusionada como `9ab6e5f`. Ninguno modificó
la interfaz ni el ranking.

La PR #92, fusionada como `078540e`, fijó el diseño y el plan del motor
`RecommendationDecision`. La implementación se divide en tres PR secuenciales:
seguridad por ingrediente, afinidad estacional y decisión reproducible.

## Motor `RecommendationDecision` — fusionado

La PR #95 se revisó de forma independiente y se fusionó como `7fca4bd` el
24 de julio. El motor entregado:

- define los DTO compartidos de `RecommendationDecision`;
- deriva estación meteorológica, restricciones híbridas y básicos asumidos en
  una política versionada;
- construye snapshots privados del hogar con inventario, caducidad, seguridad
  exacta por ingrediente y afinidad estacional;
- evalúa disponibilidad, FEFO simulado y ranking sin IA ni escrituras;
- expone la RPC autenticada `household_recommendation_decision(...)`.

Validaciones: `pnpm test:db` con 8 archivos y 159 pruebas (41 contratos pgTAP
de RecommendationDecision en `supabase/tests/0008`); cobertura de hogar
compartido, restricciones, estación, seguridad, RPC, selección `cook_now` y no
mutación del inventario.

Con esto el backend de la Fase 2 está completo: caducidad (#90/#91),
seguridad por ingrediente (#93), afinidad estacional (#94) y decisión
reproducible (#95). Ningún cliente consume aún el motor.

## Decisiones vigentes

- Cada usuario debe pertenecer exactamente a un hogar. La unicidad de
  `household_members.user_id` impide pertenecer a más de uno; el backfill y el
  trigger de alta crean la membresía obligatoria.
- Un hogar puede tener varios miembros y posee una única despensa y una única
  lista de la compra.
- Supabase sigue siendo el backend correcto: Postgres, Auth, RLS, Realtime y
  Edge Functions forman un monolito modular suficiente para las fases locales.
- Postgres y los comandos de dominio son la fuente de verdad. El móvil consume
  proyecciones y no decide deltas, matching canónico ni lotes.
- El inventario se registra mediante comandos idempotentes, lotes y eventos.
  `pantry_items` es una proyección, no el historial.
- El consumo usa FEFO, equivalencias canónicas y conversiones soportadas de
  unidades. Cada lote actualiza exclusivamente su `pantry_item_id`.
- El LLM interpreta y explica; no decide el ranking ni modifica inventario.
- No se introducen microservicios, colas durables, OCR remoto, notificaciones
  ni nueva infraestructura cloud antes de la Fase 5.

## Qué entregó la Fase 1

- Hogares y membresías con propiedad y RLS por hogar.
- Migración de despensa, compra y cocinados desde usuario a hogar.
- `inventory_commands`, `pantry_batches` e `inventory_events`.
- Comandos de compra, ajustes, cocinado y restauración idempotentes.
- Bloqueo de DML directo del cliente sobre las proyecciones.
- Consumo FEFO en backend con matching canónico y conversiones `g/kg` y
  `ml/l/cucharada/cucharadita`.
- Restauración auditada que puede recrear una proyección eliminada.
- RPC heredadas que evitaban el ledger revocadas para clientes autenticados.
- Cliente móvil y contexto de chat migrados al inventario del hogar.

La revisión final de la PR #88 no encontró bloqueantes. Se verificaron:

- `pnpm test:db`: 30 pruebas.
- `pnpm lint`.
- `pnpm typecheck`.
- `git diff --check`.

## Validaciones operativas aún pendientes

No son una feature nueva, pero deben ejecutarse antes de considerar preparada
una entrega remota:

- Aplicar todas las migraciones sobre una base local desechable desde cero
  mediante `supabase db reset`.
- Probar manualmente dos sesiones pertenecientes al mismo hogar y una tercera
  ajena.
- Ejecutar `deno check` sobre las Edge Functions modificadas.
- Probar el flujo móvil completo: compra, ajuste, cocinado y restauración.

Estas validaciones no autorizan a comenzar la Fase 2 si descubren un defecto:
se corrige primero en una rama `fix/*`, con PR y revisión.

## Siguiente trabajo

### Hecho (Fase 2 cerrada, 24 de julio)

La Home "decisión de hoy" consume el motor y se refinó por completo:

- Home: productos a consumir (🔴🟡) → cocina esto hoy → descubre. Backend #99,
  móvil #100. Imágenes on-demand en Home #97; modal de modificar receta con IA #98.
- Rework de recomendación: cobertura de caducidad de proteínas #101; DTO
  `pantry`/`discover` #103; orden pantry-first (menos faltantes) #102; +48
  recetas cotidianas sencillas #104; filtro por franja horaria #105; destacada
  que aprovecha lo crítico + pimienta como básico #106.
- Home verificada en dispositivo por el usuario.

Especificaciones y planes en `docs/superpowers/{specs,plans}/2026-07-24-*`.

### Hecho (demo cloud + APK, 25 de julio)

Migración a Supabase hospedado y APK de demo entregada y funcionando fuera de
la red local:

- Backend en proyecto Supabase cloud (`gnxqmlihdipgtkvaitvq`): migraciones
  aplicadas (`db push`), Edge Functions desplegadas, secrets configurados.
- APK `preview` por EAS apuntando a la nube, con Google OAuth real. Login en
  dispositivo verificado. Los cambios de backend entran con `db push` /
  `functions deploy` sin reinstalar la APK.
- Catálogo ampliado a ~470 recetas caseras (100 España por comunidades incl.
  serranito, 100 Europa, 100 Latinoamérica, 100 Asia, 20 Norteamérica) vía
  `scripts/seed/generate-home-recipes.mjs` (PRs #110/#111).

### Hecho (arreglos de la demo, 25 de julio)

Cuatro bugs reportados al probar la demo, todos resueltos y desplegados
(backend/data-only, sin reinstalar). Detalle y decisiones en la memoria de
Claude `recetasapp-demo-fixes.md`:

- #1 leche: variantes de beber (desnatada/semidesnatada) agrupadas bajo el
  canónico de leche entera (migr 0063, PR #113).
- #2/#3 variedad: rotación aleatoria en `household_today_decision` (migr 0062,
  volatile, PR #112) — el pull-to-refresh y las visitas ya no repiten.
- #4 chat: catálogo-primero con ranking por despensa (RPC
  `household_recipe_ranking` + `resolveRecipeForChat`, PR #114). Primer slice de
  la Fase 3: el chat busca en el recetario y devuelve la más cocinable antes de
  generar; las modificaciones (`is_modification`) se generan frescas. Spec en
  `docs/superpowers/specs/2026-07-25-chat-pantry-first-design.md`.

Pendiente menor (requiere rebuild de APK): endurecer el caché en memoria del
`CanonicalMap` en `apps/mobile/src/lib/ingredients.ts` (TTL o refresco), para que
un cambio de agrupación no exija reiniciar la app.

### Después (fondo de la visión)

3. **Fase 3: motor conversacional delgado**. Orden: receta existente →
   adaptación → generación (corrige la prioridad heredada del 21 de julio).
   Primer slice HECHO (#114): el chat busca en el catálogo y rankea por
   despensa antes de generar. Falta: que el LLM explique un top-N (no una sola)
   y la capa de adaptación conversacional intermedia entre existente y generar.
4. **Personalización por gustos**: seguir favoritos/valoraciones y recomendar
   del mismo estilo (base: `user_recipes` + embeddings).
5. **Fase 4: ciclo compartido**: Realtime de lista/despensa, plan semanal como
   propuesta editable, contrato de tickets con confirmación manual.

La infraestructura cloud se adelanta ahora, pero solo con alcance de demo
(migrar backend + APK). Realtime, tickets con OCR y la operación completa de
producción (backups, alertas, colas durables) siguen fuera de alcance hasta la
Fase 5 completa.

## Flujo obligatorio

Se trabaja una feature cada vez:

1. Rama nueva desde `main`.
2. Implementación y pruebas.
3. PR.
4. Revisión mediante agente.
5. Corrección y nueva revisión si hay hallazgos.
6. Confirmación del usuario antes de fusionar.
7. No comenzar la siguiente feature hasta que la PR anterior esté validada y
   fusionada.

El directorio local `.claude/` permanece sin seguimiento y fuera de las PR.
