/**
 * Reusable Playwright API mock helpers for the BFF (Backend-for-Frontend) SPA.
 *
 * The browser is a pure cookie client: it holds only an opaque HttpOnly session
 * cookie. There is NO access token, refresh token, PKCE verifier or OAuth state
 * in JavaScript — the BFF runs the Authorization Code + PKCE flow server-side.
 *
 * The SPA bootstraps auth on every cold navigation via:
 *   • GET  /bff/session          → { authenticated, user?, csrf? }   (same-origin)
 *   • GET  /api/admin/profile    → the admin User (role drives RBAC) (admin API)
 * and starts login with a full-page navigation to:
 *   • GET  /bff/login[?return_to=…]  (server-side OAuth — never completed here)
 *
 * These helpers register page.route() handlers that intercept those calls at the
 * network layer, so no real backend is needed. `/bff/*` calls are same-origin
 * (localhost:5174); `/api/admin/*` calls go to VITE_ADMIN_API_URL
 * (localhost:8081 in the test env). We match both with `**`-prefixed globs.
 */
import type { Page, Route } from '@playwright/test'

// ─── Roles ─────────────────────────────────────────────────────────────────────
export const ROLE_SUPER_ADMIN = 'super_admin'
export const ROLE_APP_ADMIN   = 'app_admin'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body:        JSON.stringify(body),
  })
}

/** Build a full admin profile with the given role (shape of `/api/admin/profile`). */
function buildProfile(role: string) {
  return {
    id:             1,
    email:          'admin@example.com',
    name:           'Test Admin',
    role,
    email_verified: true,
    locked:         false,
    mfa_enabled:    false,
    created_at:     '2024-01-01T00:00:00Z',
    updated_at:     '2024-01-01T00:00:00Z',
  }
}

// ─── Session bootstrap ──────────────────────────────────────────────────────────

/**
 * Unauthenticated: `GET /bff/session` reports no session, so the router guard
 * redirects protected routes to /auth/login and never fetches the profile.
 */
export async function mockUnauthenticatedSession(page: Page) {
  await page.route('**/bff/session', route => json(route, { authenticated: false }))
}

/**
 * Authenticated: a valid BFF session plus a matching admin profile. The profile
 * `role` is what drives `isAuthenticated` / `isSuperAdmin` in the store. A
 * permissive catch-all handles any additional `/api/**` data calls guarded pages
 * make on load so they don't fail against a non-existent backend.
 */
export async function mockAuthenticatedSession(
  page: Page,
  { role = ROLE_SUPER_ADMIN }: { role?: string } = {},
) {
  // Registered first → lowest priority (Playwright matches most-recent first).
  await page.route('**/api/**', route => json(route, {}))
  await page.route('**/bff/session', route =>
    json(route, {
      authenticated: true,
      user: { sub: '1', email: 'admin@example.com', name: 'Test Admin', roles: [role] },
      csrf: 'test-csrf-token',
    }),
  )
  await page.route('**/api/admin/profile', route => json(route, buildProfile(role)))
}

// ─── Login start (full-page redirect to the BFF) ────────────────────────────────

/**
 * Intercept the full-page navigation to `/bff/login` that the "Sign in" button
 * triggers. The real BFF would 302 to the authorization server; here we just
 * serve a stub so the browser doesn't hit a dead origin. Tests capture the
 * request (via page.waitForRequest) to assert the target and `return_to`.
 */
export async function mockBffLogin(page: Page) {
  await page.route('**/bff/login*', route =>
    route.fulfill({
      status:      200,
      contentType: 'text/html',
      body:        '<!doctype html><html><body>bff-login-stub</body></html>',
    }),
  )
}

// ─── Forced password change (ADMIN-SPA-MIGRATION.md §6) ──────────────────────────

/**
 * Simulate a must-change-password admin: the BFF session is valid, but every
 * `/api/admin/*` call returns `403 password_change_required` (here the profile
 * fetch), which the axios interceptor turns into the forced-change gate. After a
 * successful change the backend revokes all tokens, so the session flips to
 * unauthenticated — modelled here with a mutable flag flipped by the
 * change-password POST.
 */
export async function mockMustChangePassword(page: Page) {
  const state = { changed: false }

  await page.route('**/bff/session', route =>
    json(
      route,
      state.changed
        ? { authenticated: false }
        : {
            authenticated: true,
            user: { sub: '1', email: 'admin@example.com', name: 'Test Admin', roles: [ROLE_SUPER_ADMIN] },
            csrf: 'test-csrf-token',
          },
    ),
  )

  await page.route('**/api/admin/profile', route =>
    state.changed
      ? json(route, { message: 'Unauthorized' }, 401)
      : json(route, { error: 'password_change_required' }, 403),
  )

  await page.route('**/api/admin/change-password', route => {
    state.changed = true
    return json(route, {})
  })

  await page.route('**/bff/logout', route => json(route, {}))
}
