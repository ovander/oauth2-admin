/**
 * E2E — Navigation guard behaviour
 *
 * Tests the Vue Router beforeEach guard at browser level:
 *   • Unauthenticated user is redirected to /auth/login from any protected route
 *   • The intended path is preserved as ?redirect= for post-login restoration
 *   • Authenticated user visiting /auth/login is bounced to Dashboard
 *   • Super-admin-only routes return 403 for app_admin users
 *   • The /auth/callback route passes through the guards untouched
 */
import { test, expect }          from '@playwright/test'
import {
  mockUnauthenticated,
  mockAuthenticatedSession,
  SUPER_ADMIN_USER,
  APP_ADMIN_USER,
} from '../fixtures/api-mocks'

// ─── Unauthenticated redirects ────────────────────────────────────────────────
test('visiting / while unauthenticated redirects to /auth/login', async ({ page }) => {
  await mockUnauthenticated(page)

  await page.goto('/')

  await expect(page).toHaveURL('/auth/login')
})

test('visiting a protected sub-route redirects and preserves path as ?redirect=', async ({ page }) => {
  await mockUnauthenticated(page)

  await page.goto('/settings')

  // Vue Router puts the raw (unencoded) path in the redirect query param
  await expect(page).toHaveURL('/auth/login?redirect=/settings')
})

test('visiting /security while unauthenticated captures the redirect path', async ({ page }) => {
  await mockUnauthenticated(page)

  await page.goto('/security')

  // Wait for async router guard to complete the redirect
  await expect(page).toHaveURL(/\/auth\/login/)

  const url = new URL(page.url())
  expect(url.pathname).toBe('/auth/login')
  expect(url.searchParams.get('redirect')).toBe('/security')
})

// ─── Authenticated user on guest route ────────────────────────────────────────
test('authenticated user visiting /auth/login is redirected to Dashboard', async ({ page }) => {
  await mockAuthenticatedSession(page, SUPER_ADMIN_USER)

  await page.goto('/auth/login')

  await expect(page).toHaveURL('/')
})

// ─── Super-admin-only route ───────────────────────────────────────────────────
test('app_admin visiting /users is redirected to /403', async ({ page }) => {
  await mockAuthenticatedSession(page, APP_ADMIN_USER)

  await page.goto('/users')

  await expect(page).toHaveURL('/403')
})

// ─── Callback route passthrough ───────────────────────────────────────────────
test('visiting /auth/callback is allowed through the guards (not redirected away)', async ({ page }) => {
  // No PKCE login in progress, so the exchange fails — but the guard must NOT
  // bounce the route to /auth/login or Dashboard; the callback view handles it.
  await page.goto('/auth/callback?code=abc&state=xyz')

  await expect(page).toHaveURL(/\/auth\/callback/)
  await expect(page.getByText(/sign-in failed/i)).toBeVisible()
})
