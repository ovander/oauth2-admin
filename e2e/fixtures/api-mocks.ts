/**
 * Reusable Playwright API mock helpers.
 *
 * Each helper registers page.route() handlers that intercept real HTTP calls
 * the app makes to localhost:8081 (VITE_ADMIN_API_URL in the test env).
 * No real backend is needed.
 */
import type { Page, Route } from '@playwright/test'

export const API = 'http://localhost:8081'

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

/** Standard login that returns a full session (no MFA). */
export async function mockLoginSuccess(page: Page, user = SUPER_ADMIN_USER) {
  await page.route(`${API}/api/admin/login`, route =>
    json(route, { access_token: 'e2e-access-token', user }),
  )
  await mockProfileSuccess(page, user)
  await mockRefreshFail(page)    // no silent refresh needed for this flow
}

/** Login that triggers an MFA challenge. */
export async function mockLoginMfaChallenge(page: Page) {
  await page.route(`${API}/api/admin/login`, route =>
    json(route, { requires_mfa: true }),
  )
}

/** MFA verification that completes the session. */
export async function mockMfaVerifySuccess(page: Page, user = SUPER_ADMIN_USER) {
  await page.route(`${API}/api/admin/mfa/verify`, route =>
    json(route, { access_token: 'e2e-mfa-token', user }),
  )
  await mockProfileSuccess(page, user)
}

/** Login that returns 401 (wrong credentials). */
export async function mockLoginFail(page: Page, message = 'Invalid credentials') {
  await page.route(`${API}/api/admin/login`, route =>
    json(route, { message }, 401),
  )
}

/** Logout — always succeeds. */
export async function mockLogout(page: Page) {
  await page.route(`${API}/api/admin/logout`, route => json(route, {}))
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

/** Refresh — returns 401 (no valid refresh cookie). */
export async function mockRefreshFail(page: Page) {
  await page.route(`${API}/api/admin/refresh`, route =>
    json(route, { message: 'No session' }, 401),
  )
}

/** Refresh — returns a new token. */
export async function mockRefreshSuccess(page: Page, user = SUPER_ADMIN_USER) {
  await page.route(`${API}/api/admin/refresh`, route =>
    json(route, { access_token: 'refreshed-token', user }),
  )
}

/**
 * Complete unauthenticated state:
 *   profile → 401, refresh → 401
 * This makes the router guard redirect to /auth/login.
 */
export async function mockUnauthenticated(page: Page) {
  await mockProfileFail(page)
  await mockRefreshFail(page)
}

/** Password reset — always succeeds. */
export async function mockResetPasswordSuccess(page: Page) {
  await page.route(`${API}/api/admin/reset-password`, route => json(route, {}))
}

/** Request password reset — always succeeds. */
export async function mockRequestPasswordResetSuccess(page: Page) {
  await page.route(`${API}/api/admin/request-password-reset`, route => json(route, {}))
}
