# Estado del proyecto y punto de reanudación

Última actualización: 24 de julio de 2026.

Este documento es la memoria operativa del roadmap. Al retomar el trabajo en
otro chat o editor, debe leerse antes del plan maestro:
`docs/superpowers/plans/2026-07-23-vision-producto-arquitectura.md`.

## Estado resumido

| Fase del plan maestro | Estado | Entrega |
| --- | --- | --- |
| Fase 0 — Contrato de dominio y red de seguridad | Completada | PR #87, commit `15a50d9` |
| Fase 1 — Motor de inventario fiable | Completada y revisada | PR #88, commit de merge `10ebde9` |
| Fase 2 — Caducidad y decisión reproducible | En curso | Caducidad en PR #90/#91; diseño de decisión en PR #92 |
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

## Trabajo actual — seguridad por ingrediente

Rama: `feat/ingredient-allergen-profiles`.

El slice en curso:

- cubre los 331 ingredientes del catálogo autoritativo
  `0007_ingredients_seed.sql`;
- distingue composición `exact_reviewed` de `variable_unknown`;
- modela 14 exclusiones y las dietas `vegan`/`vegetarian`;
- mantiene preparados genéricos sin formulación verificable en fallo cerrado;
- genera la migración `0051` por `normalized_name`, sin UUID portables;
- normaliza perfiles, exclusiones y dietas en cuatro tablas globales con RLS.

Validaciones implementadas hasta ahora:

- dataset válido con 331 perfiles, 73 de composición variable y 4 fuentes;
- 12 pruebas negativas del validador;
- 9 contratos del generador reproducible;
- migración local `0051` aplicada;
- `pnpm test:db`: 6 archivos y 85 pruebas;
- `pnpm lint`, `pnpm typecheck` y `git diff --check`.

Este slice todavía no está autorizado para fusionarse hasta completar todas
las validaciones, abrir PR y obtener una revisión independiente sin
bloqueantes.

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

La Fase 2 continúa con la decisión reproducible de recomendaciones. El diseño
aprobado se documenta en
`docs/superpowers/specs/2026-07-24-recommendation-decision-design.md`.
El plan ejecutable de las tres PR se documenta en
`docs/superpowers/plans/2026-07-24-recommendation-decision.md`.

1. Completar y fusionar la PR del mapa curado ingrediente → seguridad y dieta.
2. Crear otra rama para clasificar la afinidad culinaria estacional de las
   recetas y obtener una PR validada.
3. Solo después, crear una tercera rama para `RecommendationDecision`.
4. Integrar restricciones híbridas, disponibilidad, caducidad, estación y
   franja en una política reproducible.
5. Abrir PR y obtener una revisión sin bloqueantes antes de cambiar Home.

No se debe abordar todavía el rediseño de Home/chat, Realtime, tickets ni
infraestructura cloud.

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
