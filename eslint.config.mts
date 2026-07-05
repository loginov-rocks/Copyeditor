import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import obsidianmd from 'eslint-plugin-obsidianmd';
import perfectionist from 'eslint-plugin-perfectionist';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'node_modules',
    'dist',
    'coverage',
    'esbuild.config.mjs',
    'version-bump.mjs',
    'versions.json',
    'main.js',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
  ]),
  js.configs.recommended,
  {
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        extraFileExtensions: ['.json'],
        projectService: {
          allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-member-accessibility': ['error', { overrides: { constructors: 'no-public' } }],
    },
  },
  perfectionist.configs['recommended-natural'],
  stylistic.configs.customize({ braceStyle: '1tbs', semi: true }),
  ...obsidianmd.configs.recommended,
  {
    rules: {
      '@stylistic/max-len': ['error', { code: 120, ignoreUrls: true }],
      // TODO: Remove and fix the following before release.
      'obsidianmd/no-unsupported-api': 'off',
      'obsidianmd/settings-tab/no-problematic-settings-headings': 'off',
      'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
      'obsidianmd/ui/sentence-case': 'off',
    },
  },
]);
