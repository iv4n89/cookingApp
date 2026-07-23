# Diseño: hogar único y motor de inventario

## Objetivo y alcance

Esta fase hace que la despensa y la compra pertenezcan a un hogar compartido y deja de tratar el stock como una edición aislada del móvil. Incluye la migración de los datos existentes, un ledger de inventario, lotes, comandos transaccionales y RLS por membresía.

Cada usuario pertenece a **un único hogar**. Al crear una cuenta se crea su hogar personal; invitar o cambiar de hogar queda fuera de esta fase. La UI conserva el flujo actual de un único hogar, sin selector ni sincronización Realtime.

## Modelo de datos

### Hogar y propiedad

- `households(id, name, created_at)` representa la cocina compartida.
- `household_members(household_id, user_id, role, joined_at)` tiene `unique(user_id)` para hacer efectiva la decisión de un único hogar por usuario.
- La migración crea un hogar personal y una membresía `owner` para cada perfil existente, rellena `household_id` en `pantry_items` y `shopping_list_items`, y conserva temporalmente `user_id` como columna de compatibilidad/read model.
- El trigger `handle_new_user` crea el perfil, hogar personal y membresía dentro de la misma transacción.

### Ledger y lotes

- `pantry_batches` representa una entrada física: hogar, ingrediente canónico opcional, nombre, unidad, cantidad inicial/restante, origen, confianza y fechas de compra/apertura. No calcula caducidad todavía.
- `inventory_events` es append-only: hogar, tipo, lote opcional, ingrediente, delta firmado, unidad, origen, idempotency key, actor y fecha. Una restricción única por `(household_id, idempotency_key)` hace reintentables los comandos.
- `pantry_items` sigue siendo la proyección compatible que consume la app. Un módulo SQL la recalcula desde los lotes afectados dentro de cada comando; el ledger permite contrastar o reconstruir esa proyección.

## Casos de uso y seams

Los comandos viven en funciones SQL `security definer` con `auth.uid()` y membresía de hogar; el móvil invoca esos comandos, no escribe cantidades ni deltas directamente.

1. **Completar compra**: valida que los ítems pertenecen al hogar, crea lotes y eventos `purchase`, actualiza la proyección y elimina los ítems completados.
2. **Ajustar inventario**: crea un lote o un evento `adjustment`; no elimina historia.
3. **Cocinar**: recibe receta y raciones. Resuelve ingredientes canónicos y unidades en backend, elige lotes por FEFO (sin fecha de caducidad aún, por compra más antigua) y crea eventos `consume` sin dejar stock negativo.
4. **Restaurar**: crea eventos `restore` y actualiza/recrea los lotes correspondientes; no borra el evento original.

La conversión de unidades y el matching por canónico se trasladan desde `apps/mobile/src/lib/pantry-match.ts` a una única implementación SQL. No se introduce un repositorio o adapter que solo delegue: las funciones SQL ya son el seam transaccional profundo para este dominio.

## Lecturas y seguridad

RLS de `pantry_items`, `shopping_list_items`, lotes y eventos usa una única comprobación de membresía de hogar. La migración elimina las políticas basadas exclusivamente en `user_id` una vez que la app usa `household_id`.

Las lecturas siguen pudiendo ir por PostgREST bajo RLS; los cambios de despensa, compra y cocinado pasan exclusivamente por los comandos. Así se conserva una interfaz pequeña con localidad para reglas de stock, concurrencia e idempotencia.

## Compatibilidad y errores

- No se borra `user_id` en esta fase: permite migración reversible y conservar pantallas existentes mientras adoptan DTOs de hogar.
- Un comando con la misma idempotency key devuelve el resultado ya aplicado, sin crear eventos ni descontar de nuevo.
- Una receta, un ítem o un lote de otro hogar produce error de autorización; una cantidad imposible produce error de dominio sin cambios parciales.
- El hogar personal se crea antes de insertar cualquier despensa/lista de un usuario nuevo.

## Verificación

- pgTAP: backfill de usuarios existentes; creación de hogar para nuevo usuario; RLS de dos miembros del mismo hogar y rechazo de un tercero; idempotencia; stock no negativo; reconstrucción de proyección desde lotes/eventos.
- `supabase db reset`, `pnpm test:db`, `pnpm lint`, `pnpm typecheck` y `deno check` de las funciones modificadas.
- Prueba manual local: dos sesiones del mismo hogar ven la misma despensa/lista tras una compra y un cocinado.

## Límites explícitos

No incluye invitaciones, múltiples hogares, selector de hogar, Realtime, caducidades, tickets, planificación ni notificaciones. Esos cambios se apoyarán en estas tablas y comandos en las fases posteriores.
