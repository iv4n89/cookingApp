# Plan de implementación: hogar único y motor de inventario

## Fase 0 — Descubrimiento consolidado

**Fuentes:** ADR 0001, el diseño aprobado de Fase 1, migraciones `0001`, `0002`, `0008`, `0009`, `0017`, `0019`, `0029`, `0033`; `pantry-match.ts`; librerías móviles de despensa, compra y cocinado; pgTAP `0001_rls_contracts.test.sql`.

**APIs/patrones permitidos:** migración `0035`, `security definer` + `set search_path = ''` + `auth.uid()` de `0019`/`0029`; RLS explícito y grants de `0002`; pgTAP transaccional de `supabase/tests/0001_rls_contracts.test.sql`; funciones de lectura `stable security invoker` de `0033`.

**Guardas:** calificar objetos `public.*` en definer; bloquear filas de lote con `for update`; no confiar en deltas del cliente; no dejar DML directo de tablas de inventario a `authenticated`; no borrar historial al restaurar; no inventar conversiones que `pantry-match.ts` no soporte.

## Fase 1 — Migración de hogar y migración compatible

1. Crear `0035_household_inventory_engine.sql` con `households`, `household_members` e índice/constraint único de miembro.
2. Extender `handle_new_user()` de `0002` siguiendo su firma exacta para crear perfil, hogar personal y membresía owner en una transacción.
3. Añadir `household_id` a `pantry_items`, `shopping_list_items` y `cooked_recipes`; backfill por cada usuario, índices y `not null` solo tras completar el backfill.
4. Reescribir RLS por comprobación de membresía y conservar `user_id` como actor/read-model de compatibilidad.

**Verificar:** pgTAP crea un usuario de Auth y obtiene hogar/membresía; dos miembros leen el mismo hogar y un tercero no. `supabase db reset` pasa.

## Fase 2 — Ledger, lotes e idempotencia

1. Añadir `inventory_commands` como registro de comando (`household_id`, key, kind, actor, result, timestamps) con unicidad `(household_id, idempotency_key)`.
2. Añadir `pantry_batches` y `inventory_events` append-only. Copiar el estado actual de `pantry_items` a un lote y evento de apertura durante el backfill.
3. Implementar helpers privados SQL: comprobar membresía, iniciar/reutilizar comando, actualizar proyección y seleccionar lotes por FEFO (`purchased_at`, luego `created_at`) con `for update`.

**Verificar:** reintentar una compra/cocinado devuelve el mismo resultado; eventos y lotes no se duplican; proyección y sumatorio de lotes coinciden.

## Fase 3 — Comandos y cliente

1. Sustituir `buy_shopping_items`, `apply_cook` y `uncook_recipe` por comandos de hogar con idempotency key. Copiar la matriz de unidades de `pantry-match.ts`; cantidades/unidades no comparables no se descuentan.
2. Mover inserciones/ediciones de `pantry.ts`, `shopping.ts`, `shopping-plan.ts` y `recipes.ts` a RPCs de comando; conservar lecturas RLS como read models.
3. Migrar `recommended_recipes` y el contexto de `chat` para resolver la despensa del hogar del usuario.

**Verificar:** compra, ajuste, cocinado y restauración son atómicos, no dejan stock negativo y no dependen de `computeCookDeltas` en el cliente. `rg` confirma que no quedan DML directos contra despensa/compra.

## Fase 4 — Validación final

- Ejecutar `supabase db reset`, `pnpm test:db`, `pnpm lint`, `pnpm typecheck`, `deno check` y `git diff --check`.
- Probar dos sesiones locales del mismo hogar: compra, despensa, cocinado y restauración.
- Revisar contratos compartidos y actualizar ADR 0001 para reflejar el hogar único por usuario.
