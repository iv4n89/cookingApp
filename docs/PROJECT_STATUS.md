# Estado del proyecto y punto de reanudación

Última actualización: 24 de julio de 2026.

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
| Fase 2 — Caducidad y decisión reproducible | Backend completado; falta Home "decisión de hoy" | Caducidad #90/#91; seguridad #93; estación #94; decisión #95 (`7fca4bd`) |
| Fase 3 — Motor conversacional delgado | Pendiente | Depende de Fase 2 |
| Fase 4 — Compra compartida y ciclo diario | Pendiente | Depende de Fase 3 |
| Fase 5 — Preparación cloud y operación | Aplazada | Solo con infraestructura remota |
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

Orden acordado el 24 de julio, alineado con el ciclo diario de la visión:

1. **Validaciones operativas pendientes** (sección anterior): db reset desde
   cero, dos sesiones del mismo hogar, `deno check` y flujo móvil completo.
   Home se apoyará en todo ese stack.
2. **Cerrar la Fase 2: Home "decisión de hoy"**. Un único DTO desde
   `household_recommendation_decision`: productos prioritarios con estado de
   caducidad, explicación y confianza; recetas para aprovecharlos; acciones de
   compra. Es la primera superficie que consume el motor.
3. **Fase 3: motor conversacional delgado**. El chat ejecuta primero el motor
   y el LLM solo explica el top-N. Orden: receta existente → adaptación →
   generación. Corrige la prioridad heredada del 21 de julio (generación LLM
   como vía principal).
4. **Fase 4: ciclo compartido**: Realtime de lista/despensa, plan semanal como
   propuesta editable, contrato de tickets con confirmación manual.

El diseño del motor está en
`docs/superpowers/specs/2026-07-24-recommendation-decision-design.md` y el
plan de sus tres PR en
`docs/superpowers/plans/2026-07-24-recommendation-decision.md`.

No se debe abordar todavía Realtime, tickets con OCR ni infraestructura
cloud (Fases 5 y 6 siguen aplazadas).

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
