/**
 * Reusable Playwright API mock helpers.
 *
 * Each helper registers page.route() handlers that intercept real HTTP calls
 * the app makes to localhost:8081 (VITE_ADMIN_API_URL in the test env).
 * No real backend is needed.
 *
 * Authentication is an Authorization Code + PKCE flow: the SPA redirects to the
 * authorization server's hosted login (/oauth/authorize) and exchanges the
 * returned code at /oauth/token. mockPkceLogin() simulates the hosted login by
 * intercepting the authorize navigation and bouncing straight back to the SPA
 * callback with a matching state + code.
 */
import type { Page, Route } from '@playwright/test'

export const API = 'http://localhost:8081'
export const APP = 'http://localhost:5174'

// ─── Fixtures ─────────────────────────────────────────────────────────────────
export const SUPER_ADMIN_USER = {
  id:    '1',
  email: 'admin@example.com',
  name:  'Test Admin',
  role:  'super_admin',
}

export const APP_ADMIN_USER = {
  id:    '2',
  email: 'appadmin@example.com',
  name:  'App Admin',
  role:  'app_admin',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body:        JSON.stringify(body),
  })
}

// ─── Auth flows ───────────────────────────────────────────────────────────────

/**
 * Simulate a full successful Authorization Code + PKCE login:
 *   • intercept the /oauth/authorize navigation and 302 back to the SPA
 *     callback, echoing the same `state` the SPA generated + a fake `code`
 *   • mock the /oauth/token exchange
 *   • mock the admin profile fetch
 */
export async function mockPkceLogin(
  page: Page,
  { user = SUPER_ADMIN_USER, accessToken = 'e2e-access-token' } = {},
) {
  await page.route(/\/oauth\/authorize/, async route => {
    const state = new URL(route.request().url()).searchParams.get('state') ?? ''
    await route.fulfill({
      status:  302,
      headers: { location: `${APP}/auth/callback?code=e2e-auth-code&state=${encodeURIComponent(state)}` },
    })
  })
  await page.route(`${API}/oauth/token`, route =>
    json(route, { access_token: accessToken, token_type: 'Bearer', expires_in: 900 }),
  )
  await mockProfileSuccess(page, user)
}

/** Logout — always succeeds. */
export async function mockLogout(page: Page) {
  await page.route(`${API}/api/auth/logout`, route => json(route, {}))
}

/** Profile — returns the supplied user. */
export async function mockProfileSuccess(page: Page, user = SUPER_ADMIN_USER) {
  await page.route(`${API}/api/admin/profile`, route => json(route, user))
}

/** Profile — returns 401 (unauthenticated). */
export async function mockProfileFail(page: Page) {
  await page.route(`${API}/api/admin/profile`, route =>
    json(route, { message: 'Unauthorized' }, 401),
  )
}

/** Silent refresh — returns 401 (no valid refresh cookie). */
export async function mockRefreshFail(page: Page) {
  await page.route(`${API}/api/auth/refresh`, route =>
    json(route, { message: 'No session' }, 401),
  )
}

/** Silent refresh — returns a fresh access token (existing cookie session). */
export async function mockRefreshSuccess(page: Page, accessToken = 'refreshed-token') {
  await page.route(`${API}/api/auth/refresh`, route =>
    json(route, { access_token: accessToken, token_type: 'Bearer', expires_in: 900 }),
  )
}

/**
 * Simulate an already-authenticated session re-hydrated from the HttpOnly
 * refresh cookie on a cold load: refresh → token, profile → user.
 */
export async function mockAuthenticatedSession(page: Page, user = SUPER_ADMIN_USER) {
  await mockRefreshSuccess(page)
  await mockProfileSuccess(page, user)
}

/**
 * Complete unauthenticated state:
 *   refresh → 401, profile → 401
 * This makes the router guard redirect to /auth/login.
 */
export async function mockUnauthenticated(page: Page) {
  await mockProfileFail(page)
  await mockRefreshFail(page)
}

/** Password reset — always succeeds. */
export async function mockResetPasswordSuccess(page: Page) {
  await page.route(`${API}/api/auth/reset-password`, route => json(route, {}))
}

/** Request password reset — always succeeds. */
export async function mockRequestPasswordResetSuccess(page: Page) {
  await page.route(`${API}/api/auth/request-password-reset`, route => json(route, {}))
}
