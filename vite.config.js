import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    return ({
        base: mode === 'production' ? '/admin/' : '/',
        plugins: [vue()],
        cacheDir: '/tmp/vite-cache',
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
            },
        },
        server: {
            port: 5173,
            strictPort: true,
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
                    target: 'http://localhost:8080',
                    changeOrigin: true,
                },
                '^/oauth': {
                    target: 'http://localhost:8080',
                    changeOrigin: true,
                },
                // All other /api routes (/api/admin/*, /api/apps/*) → port 8081
                '^/api': {
                    target: 'http://localhost:8081',
                    changeOrigin: true,
                },
            },
        },
        build: {
            sourcemap: false,
            rollupOptions: {
                output: {
                    entryFileNames: 'assets/[name].[hash].js',
                    chunkFileNames: 'assets/[name].[hash].js',
                    assetFileNames: 'assets/[name].[hash].[ext]',
                },
            },
            chunkSizeWarningLimit: 800,
        },
        test: {
            globals: true,
            environment: 'happy-dom',
            setupFiles: ['./src/__tests__/setup.ts'],
            include: ['src/**/*.{test,spec}.{ts,tsx}'],
            env: {
                VITE_ADMIN_API_URL: 'https://api.test.example.com',
            },
            coverage: {
                provider: 'v8',
                reporter: ['text'],
                reportsDirectory: '/tmp/oauth2-coverage',
                include: [
                    'src/types/auth.ts',
                    'src/utils/roles.ts',
                    'src/utils/secureConfig.ts',
                    'src/services/api.ts',
                    'src/services/authService.ts',
                    'src/stores/authStore.ts',
                    'src/composables/useClipboard.ts',
                    'src/composables/useSessionTimeout.ts',
                    'src/views/auth/LoginView.vue',
                    'src/views/auth/MfaVerifyView.vue',
                    'src/views/auth/ResetPasswordView.vue',
                ],
                exclude: [
                    'src/**/*.spec.ts',
                    'src/**/__tests__/**',
                ],
                thresholds: {
                    statements: 80,
                    branches: 80,
                    functions: 80,
                    lines: 80,
                },
            },
        },
    });
});
