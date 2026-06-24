// Flat ESLint config (ESLint v9+) for the Socrate Superadmin Portal.
//
// Goal: a SECURITY + CORRECTNESS gate, not a style firehose. Formatting is left
// to the team's own conventions; this config blocks dangerous patterns (XSS
// sinks, eval, javascript: URLs) and real bugs. Type checking is provided by
// `vue-tsc`, so type-aware lint rules are intentionally not enabled here.
//
// No security-plugin dependencies are added on purpose: the dangerous-sink
// bans below are expressed with ESLint built-ins + eslint-plugin-vue so the
// SPA's own supply chain stays minimal.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

// Browser DOM XSS sinks that must never be assigned from app code.
const BANNED_PROPERTIES = [
  { property: 'innerHTML', message: 'Assigning innerHTML is an XSS sink. Use textContent or framework binding.' },
  { property: 'outerHTML', message: 'Assigning outerHTML is an XSS sink. Use textContent or framework binding.' },
  { property: 'insertAdjacentHTML', message: 'insertAdjacentHTML is an XSS sink. Build DOM nodes instead.' },
]

export default tseslint.config(
  // ── Ignored paths ───────────────────────────────────────────────────────────
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'public/**',
      '*.timestamp-*',
    ],
  },

  // ── Base JS + TypeScript + Vue (essential: correctness, not formatting) ──────
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  // ── Language options ────────────────────────────────────────────────────────
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // Use the TypeScript parser for <script lang="ts"> blocks inside .vue files.
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  // ── Security + correctness rules ────────────────────────────────────────────
  {
    rules: {
      // ── Hardening: dangerous code-execution + XSS sinks ──────────────────────
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error', // bans `javascript:` URLs
      'no-restricted-properties': ['error', ...BANNED_PROPERTIES],
      // XSS via Vue: v-html bypasses template escaping.
      'vue/no-v-html': 'error',

      // ── Correctness / hygiene ────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // View/layout filenames like LoginView, AdminLayout are already descriptive.
      'vue/multi-word-component-names': 'off',
    },
  },

  // ── Test files: relax a few rules ───────────────────────────────────────────
  {
    files: ['**/__tests__/**', '**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-properties': 'off',
      // Tests intentionally feed `javascript:` URLs to verify the redirect guard rejects them.
      'no-script-url': 'off',
    },
  },
)
