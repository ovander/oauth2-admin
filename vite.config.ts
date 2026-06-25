import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { devCsp, productionCsp, productionCspReportOnly, SECURITY_HEADERS, originOf } from './src/security/csp'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig(({ mode }) => {
  // Origin the built app talks to (the API gateway) — added to the preview
  // server's connect-src so `vite preview` runs under the real production CSP.
  const env = loadEnv(mode, process.cwd(), '')
  const apiOrigin = originOf(env.VITE_ADMIN_API_URL)

  return {
    base: mode === 'production' ? '/admin/' : '/',

  // Inject frontend version as compile-time constants (tree-shaken in prod).
  // APP_BUILD_DATE is the ISO timestamp of the build machine at bundle time.
  define: {
    APP_VERSION:    JSON.stringify(pkg.version),
    APP_BUILD_DATE: JSON.stringify(new Date().toISOString()),
  },

  plugins: [vue()],

  // Keep the dep-optimisation cache in /tmp so concurrent Vitest + Playwright
  // dev-server runs don't produce EPERM conflicts on the node_modules/.vite dir.
  cacheDir: '/tmp/vite-cache',

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // Development server — proxy eliminates CORS entirely in dev.
  // The browser always talks to localhost:5173; Vite forwards /api/* to
  // the Go backend server-side (no preflight, no CORS headers needed).
  server: {
    port: 5173,
    strictPort: true,   // fail fast instead of silently drifting to 5174

    // Dev CSP + hardening headers from the canonical source (src/security/csp.ts).
    // Dev keeps 'unsafe-eval'/'unsafe-inline' + ws:// for Vite HMR; production is
    // the strict productionCsp() served by the reverse proxy and exercised by the
    // preview server below.
    headers: {
      'Content-Security-Policy': devCsp(),
      ...SECURITY_HEADERS,
    },

    proxy: {
      // BFF control plane + admin API → the local BFF (:8091), which mints the
      // session cookie and injects the bearer. Mirrors the production topology
      // (browser → BFF → backend). Listed BEFORE the issuer routes.
      '^/bff': {
        target:       'http://localhost:8091',
        changeOrigin: true,
      },
      '^/api/admin': {
        target:       'http://localhost:8091',
        changeOrigin: true,
      },
      // Public, pre-auth issuer flows the BFF does not proxy → issuer (:8080).
      '^/api/auth': {
        target:       'http://localhost:8080',
        changeOrigin: true,
      },
      '^/api/profile': {
        target:       'http://localhost:8080',
        changeOrigin: true,
      },
      '^/oauth': {
        target:       'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },

  // Preview server (`vite preview`) serves the production build under the REAL
  // production CSP + the Trusted Types Report-Only policy — the place to soak-test
  // strict CSP / Trusted Types violations before promoting them at the proxy.
  preview: {
    headers: {
      'Content-Security-Policy':             productionCsp(apiOrigin),
      'Content-Security-Policy-Report-Only': productionCspReportOnly(apiOrigin),
      ...SECURITY_HEADERS,
    },
  },

  build: {
    // Explicitly disable source maps in all builds (F-15).
    // If source maps are needed for error tracking (e.g. Sentry), generate
    // them separately and upload via the Sentry Vite plugin without including
    // them in the public bundle.
    sourcemap: false,

    // Ensure assets are content-hashed for cache-busting
    rollupOptions: {
      output: {
        // Deterministic chunk naming with content hash
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
      },
    },

    // Warn when chunks exceed 800 kB — helps catch accidental bundle bloat
    chunkSizeWarningLimit: 800,
  },

  // ─── Vitest ───────────────────────────────────────────────────────────────
  test: {
    globals:     true,
    environment: 'happy-dom',
    setupFiles:  ['./src/__tests__/setup.ts'],
    include:     ['src/**/*.{test,spec}.{ts,tsx}'],
    // Reset mock call history before each test. vitest 4's restoreAllMocks (in
    // setup.ts) no longer clears auto-mock call history the way v2 did, so make
    // the per-test reset explicit and runner-version-independent.
    clearMocks:  true,
    env: {
      // Origins the test axios instances resolve to. MSW registers handlers at
      // this absolute BASE (see src/__tests__/msw/handlers.ts), so both the admin
      // API and the public issuer flows must point here in the test env.
      VITE_ADMIN_API_URL: 'https://api.test.example.com',
      VITE_OIDC_ISSUER:   'https://api.test.example.com',
    },
    coverage: {
      provider: 'v8',
      reporter:        ['text'],
      reportsDirectory: '/tmp/oauth2-coverage',

      // ── Scope coverage to the security-critical modules that have tests. ──
      // Out-of-scope views (applications, dashboard, users, logs, etc.) are
      // excluded; they are candidates for the next testing sprint.
      //
      // authService.ts is now included: MSW integration tests in
      // src/__tests__/integration/authService.spec.ts exercise every exported
      // function against a real Axios instance.
      //
      // api.ts interceptor callbacks (401-retry queue, refresh handler) are
      // now covered by src/__tests__/integration/api.interceptor.spec.ts.
      include: [
        'src/types/auth.ts',
        'src/utils/roles.ts',
        'src/utils/secureConfig.ts',
        'src/services/api.ts',
        'src/services/authService.ts',
        'src/services/session.ts',
        'src/services/adminGuards.ts',
        'src/security/csp.ts',
        'src/stores/authStore.ts',
        'src/composables/useClipboard.ts',
        'src/composables/useSessionTimeout.ts',
        'src/views/auth/LoginView.vue',
        'src/views/auth/ResetPasswordView.vue',
      ],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/__tests__/**',
      ],

      thresholds: {
        // All thresholds raised to 80 % now that:
        //   - authService.ts is tested via MSW integration tests
        //   - api.ts interceptor callbacks are tested via api.interceptor.spec.ts
        statements: 80,
        branches:   80,
        functions:  80,
        lines:      80,
      },
    },
  }
  }
})
