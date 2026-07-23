# Limpieza de advertencias de lint — diseño

Fecha: 2026-07-23

## Objetivo

Dejar `pnpm lint` sin advertencias en el código de aplicación, eliminando los
`require()` de componentes y corrigiendo los avisos de hooks e imports.

## Alcance

- Sustituir los accesos a `@recetas/theme/tailwind-preset` en TS/TSX por los
  exports tipados de `@recetas/theme/tokens`.
- Corregir los avisos de hooks sin alterar el comportamiento de cargas, timers o
  estado de receta.
- Eliminar imports duplicados y sin usar.
- Mantener como excepciones CommonJS `metro.config.js`, `tailwind.config.js` y
  `scripts/reset-project.js`, porque Expo SDK 57 y NativeWind los documentan con
  ese formato.

## Diseño

Los componentes importarán `colors` directamente desde `@recetas/theme/tokens`.
Se elimina así la dependencia runtime del preset de Tailwind y cada consumidor usa
la fuente de tokens tipada.

Los hooks se refactorizarán para que los efectos se limiten a suscripciones o
arranque de operaciones asíncronas, evitando actualizaciones síncronas de estado en
el cuerpo del efecto. Se mantendrán los estados de carga y error actuales.

La configuración ESLint excluirá los tres archivos CommonJS de la regla
`@typescript-eslint/no-require-imports`, pero seguirá analizándolos con las reglas
JavaScript aplicables.

## Verificación

1. `pnpm lint` termina sin advertencias ni errores.
2. `pnpm typecheck` termina correctamente.
3. `pnpm --filter @recetas/mobile lint` termina sin advertencias ni errores.
4. La búsqueda de `require(` no devuelve coincidencias en `apps/mobile/src`.
5. Los cambios CommonJS se limitan a configuración o scripts documentados.
