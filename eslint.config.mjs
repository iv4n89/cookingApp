import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const mobileFiles = ['apps/mobile/**/*.{js,jsx,ts,tsx}'];
const packageTypeScriptFiles = ['packages/shared/**/*.ts', 'packages/theme/**/*.ts'];
const packageJavaScriptFiles = ['packages/shared/**/*.js', 'packages/theme/**/*.js'];
const commonJsFiles = [
  'apps/mobile/metro.config.js',
  'apps/mobile/tailwind.config.js',
  'apps/mobile/scripts/reset-project.js',
  'packages/theme/tailwind-preset.js',
];

function scopeConfig(configs, files, prefixPatterns = false) {
  return configs.map((config) => {
    const scoped = {
      ...config,
      files: config.files
        ? config.files.map((pattern) => `${prefixPatterns ? 'apps/mobile/' : ''}${pattern}`)
        : files,
    };
    if (config.ignores) {
      scoped.ignores = config.ignores.map((pattern) =>
        `${prefixPatterns ? 'apps/mobile/' : ''}${pattern}`,
      );
    }
    return scoped;
  });
}

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.expo/**',
    '**/dist/**',
    'supabase/.branches/**',
    'supabase/.temp/**',
  ]),
  ...scopeConfig(expoConfig, mobileFiles, true),
  {
    files: commonJsFiles,
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: mobileFiles,
    settings: {
      'import/resolver': {
        typescript: {
          project: './apps/mobile/tsconfig.json',
        },
      },
    },
    rules: {
      // El proyecto ya usa estos efectos de carga. Se mantienen visibles mientras se
      // refactorizan por separado, pero no bloquean la adopción inicial del lint.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    ...js.configs.recommended,
    files: packageJavaScriptFiles,
  },
  ...scopeConfig(tseslint.configs.recommended, packageTypeScriptFiles),
]);
