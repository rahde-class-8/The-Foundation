import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'supabase/.temp',
      'src/lib/database.types.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    extends: [jsxA11y.flatConfigs.recommended],
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'Raw HTML rendering is forbidden (SECURITY §8). Use the sanitized Markdown renderer.',
        },
      ],
    },
  },
  {
    // Tests may assert presence with `!` after setting up the data themselves.
    files: ['**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // shadcn/ui primitives export variant helpers next to components by design.
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Features may not reach into each other's internals (DIRECTORY_STRUCTURE boundary rules).
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*/*'],
              message: 'Import shared code from @/components or @/lib instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // The domain core is pure: no I/O, no runtime globals, no app imports (ADR-0002).
    files: ['supabase/functions/_shared/core/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/*', '../../../../src/*'],
              message: 'The core must not import application code.',
            },
            {
              group: ['node:*', 'npm:*', 'jsr:*', 'https://*'],
              message: 'Import runtime dependencies via core/deps.ts only.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'Deno',
        'process',
        'window',
        'document',
        'fetch',
        'localStorage',
      ],
    },
  },
  {
    files: ['supabase/functions/**/*.ts'],
    ignores: ['supabase/functions/_shared/core/**'],
    languageOptions: { globals: { Deno: 'readonly' } },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.{js,ts,mjs}', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
