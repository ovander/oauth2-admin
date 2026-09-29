/**
 * Proxy table of the Vite dev server (`npm run dev`), consumed by vite.config.ts
 * and checked against deploy/Caddyfile by src/__tests__/unit/devProxy.spec.ts.
 *
 * Development sends exactly the paths production sends to the BFF (the Caddy
 * `@bff` matcher, allowlisted again in bff/app.go), so `npm run dev` exercises
 * the real topology: browser → BFF (session cookie, CSRF, bearer injection) →
 * admin API or issuer. Anything else falls through to the SPA, as it does
 * behind Caddy; only the issuer's OAuth endpoints are reached directly.
 *
 * Vite tests a key starting with `^` as a regular expression against the
 * request URL *including* its query string (first match wins, in insertion
 * order), hence the `(?:\?|$)` anchors on the exact-path entries.
 */

/** DEV_BFF_TARGET is the local BFF (bff/, listening on 127.0.0.1:8091). */
export const DEV_BFF_TARGET = 'http://localhost:8091'

/** DEV_ISSUER_TARGET is the local Socrate issuer. */
export const DEV_ISSUER_TARGET = 'http://localhost:8080'

/** DevProxyEntry is the subset of Vite's ProxyOptions this table uses. */
export interface DevProxyEntry {
  target:       string
  changeOrigin: boolean
}

/** devProxy returns the `server.proxy` table of vite.config.ts. */
export function devProxy(): Record<string, DevProxyEntry> {
  const bff    = { target: DEV_BFF_TARGET, changeOrigin: true }
  const issuer = { target: DEV_ISSUER_TARGET, changeOrigin: true }
  return {
    // BFF control plane (login, callback, session, logout, elevate).
    '^/bff/':                   bff,
    // Admin API, and the app-scoped user management and activity
    // (/api/apps/{id}/users, /api/apps/{id}/logs) on the same admin listener.
    '^/api/admin/':             bff,
    '^/api/apps/':              bff,
    // Profile self-service: the BFF injects the bearer and checks CSRF.
    '^/api/profile(?:\\?|$)':   bff,
    // Public version probe and the two pre-auth password-reset posts (P3-23);
    // the rest of /api/auth is not forwarded in production either.
    '^/api/version(?:\\?|$)':   bff,
    '^/api/auth/(?:request-password-reset|reset-password)(?:\\?|$)': bff,
    // The issuer's OAuth endpoints, directly.
    '^/oauth':                  issuer,
  }
}
