# Lint y chequeo de tipos del monorepo — plan de implementación

> Especificación: `docs/superpowers/specs/2026-07-23-lint-monorepo-design.md`.

## Fase 0 — APIs confirmadas

- Expo SDK 57 admite Flat Config. Su guía usa `eslint-config-expo/flat` y
  `defineConfig` de `eslint/config`.
- `eslint-config-expo/flat` exporta un array, por lo que sus entradas deben limitarse
  a `apps/mobile/**/*.{js,jsx,ts,tsx}` antes de incorporarlas a la configuración raíz.
- Expo Router declara `tabBarIcon` con `color: ColorValue`; `MaterialIcons` acepta
  ese tipo. Referencias locales: `node_modules/expo-router/build/react-navigation/bottom-tabs/types.d.ts`
  y `node_modules/@expo/vector-icons/build/createIconSet.d.ts`.
- `packages/shared` ya tiene `tsconfig.json`; `packages/theme/tokens.ts` necesita
  uno para entrar en el chequeo de tipos.

No aplicar `eslint-config-expo` a `packages/*` ni intentar analizar TypeScript con
ESLint sin `typescript-eslint`.

## Fase 1 — Dependencias y configuración raíz

1. Instalar en raíz `eslint`, `eslint-config-expo` con Expo CLI y
   `typescript-eslint` con pnpm.
2. Crear `eslint.config.mjs` con ignores globales para dependencias y artefactos.
3. Copiar las entradas de `eslint-config-expo/flat`, limitándolas a `apps/mobile`.
4. Añadir `typescript-eslint` solo a `packages/shared` y `packages/theme`.
5. Añadir el script raíz `lint`.

Verificación:

- `pnpm exec eslint --print-config apps/mobile/src/app/_layout.tsx` resuelve.
- `pnpm exec eslint --print-config packages/shared/src/index.ts` resuelve sin
  reglas Expo.

## Fase 2 — Chequeo de tipos y reparación

1. Crear `packages/theme/tsconfig.json`, basado en `tsconfig.base.json`, que incluya
   `tokens.ts`.
2. Añadir script raíz `typecheck` que ejecute los tres `tsconfig` de forma explícita.
3. En `apps/mobile/src/app/(tabs)/_layout.tsx`, importar `ColorValue` desde
   `react-native` y usarlo en el parámetro de `tabIcon`.

Verificación:

- Los cuatro errores TS2322 de `tabBarIcon` desaparecen.
- `pnpm typecheck` termina con código 0.

No convertir el color a `string` ni usar una aserción de tipo: el contrato de Expo
Router ya es compatible con `MaterialIcons`.

## Fase 3 — Validación final

1. Ejecutar `pnpm lint` desde la raíz.
2. Ejecutar `pnpm --filter @recetas/mobile lint` para comprobar la integración con
   Expo CLI.
3. Ejecutar `pnpm typecheck`.
4. Revisar `git diff --check` y confirmar que no se incluyen los cambios locales
   preexistentes.
