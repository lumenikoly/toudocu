import { defineConfig, globalIgnores } from 'eslint/config';
import tsParser from '@typescript-eslint/parser';

const nodeOnly = [
  'node:*',
  'fs',
  'fs/*',
  'path',
  'path/*',
  'url',
  'url/*',
  'os',
  'os/*',
  'http',
  'http/*',
  'https',
  'https/*',
  'child_process',
  'child_process/*',
];

const react = ['react', 'react/*', 'react-dom', 'react-dom/*'];
const nodePackages = [
  '@toudocu/application',
  '@toudocu/application/*',
  '@toudocu/platform-node',
  '@toudocu/platform-node/*',
  '@toudocu/server',
  '@toudocu/server/*',
];
const corePackages = ['@toudocu/core', '@toudocu/core/*'];

const restricted = (patterns, message) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: patterns.map((group) => ({ group, message })),
    },
  ],
});

export default defineConfig([
  {
    files: ['packages/integrations/bb/src/**/*.{ts,tsx}'],
    rules: restricted(
      [nodePackages, corePackages, ['@toudocu/portal', '@toudocu/portal/*', 'apps/web/*']],
      'bb integration uses public CLI and contracts only.',
    ),
  },
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    'docs-en/**',
    'project-docs/**',
  ]),
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    files: [
      'packages/core/src/**/*.{ts,tsx}',
      'packages/application/src/**/*.{ts,tsx}',
      'packages/contracts/src/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'process',
        'Buffer',
        'window',
        'document',
        'navigator',
        'fetch',
        'XMLHttpRequest',
        'WebSocket',
        'localStorage',
        'sessionStorage',
      ],
    },
  },
  {
    files: ['packages/contracts/src/**/*.{ts,tsx}', 'packages/core/src/**/*.{ts,tsx}'],
    rules: restricted(
      [nodeOnly, react, nodePackages, ['@toudocu/portal', '@toudocu/portal/*']],
      'Contracts and core are runtime independent; use contracts for DTOs and adapters for I/O.',
    ),
  },
  {
    files: ['packages/application/src/**/*.{ts,tsx}'],
    rules: restricted(
      [
        nodeOnly,
        react,
        ['@toudocu/platform-node', '@toudocu/platform-node/*'],
        ['@toudocu/server', '@toudocu/server/*'],
      ],
      'Application services depend on core contracts; platform and HTTP adapters belong above this layer.',
    ),
  },
  {
    files: ['apps/web/app/**/*.{ts,tsx}'],
    rules: restricted(
      [nodePackages, corePackages, nodeOnly],
      'Browser code cannot import Node, application internals, or domain implementation packages.',
    ),
  },
  {
    files: ['packages/server/src/**/*.{ts,tsx}'],
    rules: restricted([react], 'The server adapter cannot depend on browser presentation.'),
  },
  {
    files: ['apps/cli/src/**/*.{ts,tsx}'],
    rules: restricted(
      [react, ['@toudocu/portal', '@toudocu/portal/*']],
      'The CLI is an adapter; presentation and React belong to the web layer.',
    ),
  },
]);
