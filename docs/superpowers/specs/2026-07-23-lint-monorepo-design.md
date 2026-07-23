# Lint y chequeo de tipos del monorepo — diseño

Fecha: 2026-07-23

## Objetivo

Dejar el monorepo con un chequeo reproducible de lint y TypeScript, y corregir el
error de tipos actual del navegador de pestañas móvil.

## Alcance

- Cubrir `apps/mobile`, `packages/shared` y `packages/theme`.
- Mantener las reglas específicas de Expo restringidas a `apps/mobile`.
- Añadir comandos de raíz para ejecutar lint y chequeo de tipos de forma uniforme.
- Corregir el tipo de color recibido por los iconos de Expo Router.

No se añaden reglas de formato ni un formateador en esta tarea.

## Diseño

La raíz tendrá una configuración ESLint Flat (`eslint.config.mjs`), como recomienda
Expo para SDK 57. La configuración de `eslint-config-expo/flat` se aplicará solo a
los archivos de `apps/mobile`; como exporta un conjunto de entradas de Flat Config,
se limitarán explícitamente a ese directorio. Los paquetes usarán la configuración
genérica de `typescript-eslint`, sin acoplarlos al entorno React Native.

La configuración ignorará dependencias y artefactos generados: `node_modules`,
`.expo`, directorios temporales de Supabase y salidas de compilación.

El script `lint` de raíz invocará ESLint sobre los workspaces. El script
`typecheck` coordinará `tsc --noEmit` para los proyectos TypeScript existentes. Se
añadirá un `tsconfig.json` a `packages/theme`, para que también se compruebe
`tokens.ts`.
`apps/mobile` conservará su comando `expo lint`, que detecta la configuración de
raíz; podrá ejecutarse también por separado durante el desarrollo móvil.

En el tab bar, la función que construye el icono declarará `color` como
`ColorValue`, el tipo que Expo Router proporciona y que `MaterialIcons` acepta.

## Dependencias

- `eslint` y `eslint-config-expo` como dependencias de desarrollo de la raíz,
  instaladas mediante Expo CLI para conservar compatibilidad con SDK 57.
- `typescript-eslint` como dependencia de desarrollo de la raíz, para analizar los
  archivos TypeScript de `packages/shared` y `packages/theme` fuera de Expo.

## Verificación

1. `pnpm lint` termina correctamente desde la raíz.
2. `pnpm typecheck` termina correctamente desde la raíz.
3. `pnpm --filter @recetas/mobile lint` utiliza la misma configuración y termina
   correctamente.
4. No se modifican los cambios locales previos del usuario.
