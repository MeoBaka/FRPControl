import js from '@eslint/js';
import globals from 'globals';

// Globals riêng của FRPControl (frontend gán vào window trong các IIFE).
const appGlobals = {
  App: 'writable', Store: 'writable', UI: 'writable', Fmt: 'writable',
  API: 'writable', Pages: 'writable',
};

export default [
  // Không lint code sinh ra / phụ thuộc / dashboard Vue tách riêng.
  { ignores: ['node_modules/**', 'data/**', 'web/**', 'public/vendor/**'] },

  js.configs.recommended,

  // Backend: Node.js ESM
  {
    files: ['src/**/*.js', 'server.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // Frontend: script trình duyệt (không phải module), dùng global của app.
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser, ...appGlobals },
    },
  },

  // Nới các quy tắc gây nhiễu nhưng vô hại với codebase hiện tại.
  {
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
