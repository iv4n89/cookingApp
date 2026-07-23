# ADR 0001: el hogar posee la cocina compartida

## Estado

Aceptada — 2026-07-23.

## Contexto

La visión de producto requiere que una familia comparta una sola despensa y una sola lista de la compra. El esquema actual asigna ambos recursos directamente a `user_id`, lo que impide expresar colaboración, permisos, eventos y sincronización como conceptos de dominio.

## Decisión

Se introducirá `Household` como propietario de una despensa y de una lista de compra compartidas. Cada usuario tendrá una o más `HouseholdMembership` con rol `owner` o `member`.

Al migrar el esquema en la Fase 1, cada usuario existente recibirá un hogar personal para preservar su experiencia actual. Los recursos de inventario y compra se autorizarán por pertenencia al hogar, no por titularidad individual.

## Consecuencias

- El móvil nunca seleccionará un usuario alternativo para decidir la propiedad: el backend resolverá el hogar activo y comprobará la membresía.
- Los comandos de compra, cocinado y ajuste incluirán una idempotency key y se registrarán como eventos de inventario.
- Las lecturas podrán usar read models protegidos por RLS; los cambios de stock y compra se harán mediante casos de uso transaccionales.
- Esta decisión no implementa todavía familias, migraciones ni sincronización realtime; esos cambios pertenecen a la Fase 1 y 4.
