import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig(({ mode }) => ({
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

    // Dev-only CSP delivered via Vite's own HTTP response headers.
    // Production CSP is set by Caddy/Nginx — see deployment-runbook.docx.
    // 'unsafe-eval'   — required by Vite HMR runtime
    // 'unsafe-inline' — required by Vite HMR script injection
    // ws://*          — required by Vite WebSocket hot-reload channel
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self' ws://localhost:5173 http://localhost:5173 http://localhost:8080 http://localhost:8081",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    },

    proxy: {
      // Auth + OAuth routes → port 8080 (must be listed BEFORE the /api catch-all)
      '^/api/auth': {
        target:       'http://localhost:8080',
        changeOrigin: true,
      },
      '^/oauth': {
        target:       'http://localhost:8080',
        changeOrigin: true,
      },
      // All other /api routes (/api/admin/*, /api/apps/*) → port 8081
      '^/api': {
        target:       'http://localhost:8081',
        changeOrigin: true,
      },
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
      // Provide a default value so secureConfig.ts does not throw when
      // modules are imported by test files that do not override this env var.
      VITE_ADMIN_API_URL: 'https://api.test.example.com',
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
        'src/services/oauth.ts',
        'src/services/pkce.ts',
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
  },
}))
