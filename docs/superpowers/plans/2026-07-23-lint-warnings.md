# Limpieza de advertencias de lint — plan de implementación

> Especificación: `docs/superpowers/specs/2026-07-23-lint-warnings-design.md`.

## Fase 0 — APIs confirmadas

- `@recetas/theme/tokens` expone `colors`, idéntico al objeto que el preset CJS
  entrega a los 64 componentes actuales.
- React documenta iniciar cargas async dentro del efecto, con cleanup `active` para
  ignorar resultados obsoletos.
- El estado derivable se calcula durante render; no se sincroniza desde un efecto.
- Expo SDK 57 y NativeWind documentan Metro y Tailwind con CommonJS. No migrar esos
  archivos a ESM.

## Fase 1 — Tema e higiene de imports

1. Sustituir en `apps/mobile/src` el patrón CommonJS del preset por
   `import { colors } from '@recetas/theme/tokens'`.
2. Eliminar el import no usado de `screen-placeholder.tsx` y consolidar los imports
   de `ingredients` en `shopping-plan.ts`.
3. Configurar la excepción de `no-require-imports` solo para Metro, Tailwind y el
   script de reset CommonJS.

Verificación: `rg 'require\\(' apps/mobile/src` no devuelve resultados.

## Fase 2 — Efectos React

1. Copiar el patrón local de carga async con `active` a los hooks de cocina,
   favoritos, historial, preferencias y detalle, y al selector de ingredientes.
2. Derivar el estado terminado del temporizador en render; no escribir estado al
   llegar a cero.
3. Derivar el estado `cooked` de la receta y de `cookedThisSession`.
4. Reiniciar el estado de imagen por identidad de receta, no sincronizando props a
   estado desde un efecto.

Verificación: no quedan avisos `react-hooks/set-state-in-effect` ni
`react-hooks/exhaustive-deps`.

## Fase 3 — Verificación

1. Ejecutar `pnpm lint`, `pnpm typecheck` y `pnpm --filter @recetas/mobile lint`.
2. Revisar los únicos CommonJS restantes con `rg 'require\\(' apps/mobile`.
3. Ejecutar `git diff --check` y confirmar que no se incluyen cambios locales ajenos.
