# Diseño: contratos fundacionales de dominio

## Alcance

Esta PR prepara la Fase 0 sin cambiar el comportamiento de la aplicación ni el esquema productivo. Declara la propiedad compartida del hogar, publica contratos de comandos y activa una prueba de seguridad mínima para las políticas existentes.

## Diseño

- `docs/adr/0001-household-owns-shared-kitchen.md` fija que un `Household` posee una despensa y una lista. Es la premisa de las migraciones posteriores.
- `@recetas/shared` expone los DTOs de hogar, membresía, eventos de inventario y comandos de compra, lista, cocinado, ajuste y restauración. Los comandos llevan `idempotencyKey` y `occurredAt`; no incluyen deltas calculados por el cliente.
- `supabase/tests/0001_rls_contracts.test.sql` usa pgTAP y dos usuarios de Auth para demostrar que RLS permite leer y modificar solo la despensa propia. En Fase 1 se sustituirá el criterio de usuario por membresía de hogar.
- `pnpm test:db` es el único punto de entrada para ejecutar esta base local de pruebas.

## Flujo de datos futuro

`móvil → Command DTO → caso de uso transaccional → InventoryEvent/read model → lectura RLS`.

La Fase 0 solo fija las interfaces; no introduce adaptadores, repositorios ni tablas anticipadas.

## Errores y seguridad

La idempotencia se implementará al crear los casos de uso de inventario, no se simulará en el cliente. La prueba actual falla si se elimina el aislamiento RLS que protege la despensa individual existente.

## Verificación

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:db`
- `git diff --check`
