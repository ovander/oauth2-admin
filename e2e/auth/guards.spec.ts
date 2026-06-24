/**
 * E2E — Navigation guard behaviour
 *
 * Tests the Vue Router beforeEach guard at browser level:
 *   • Unauthenticated user is redirected to /auth/login from any protected route
 *   • The intended path is preserved as ?redirect= for post-login restoration
 *   • Authenticated user visiting /auth/login is bounced to Dashboard
 *   • Super-admin-only routes return 403 for app_admin users
 *   • MFA-only route is guarded when no challenge is pending
 */
import { test, expect }          from '@playwright/test'
import {
  mockUnauthenticated,
  mockRefreshFail,
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
  await page.route('**/api/admin/refresh', route =>
    route.fulfill({
      status:      200,
      contentType: 'application/json',
      body:        JSON.stringify({
        access_token: 'already-logged-in-token',
        user: { id: '1', email: 'admin@example.com', name: 'Test', role: 'super_admin' },
      }),
    }),
  )
  await page.route('**/api/admin/profile', route =>
    route.fulfill({
      status:      200,
      contentType: 'application/json',
      body:        JSON.stringify({ id: '1', email: 'admin@example.com', name: 'Test', role: 'super_admin' }),
    }),
  )

  await page.goto('/auth/login')

  await expect(page).toHaveURL('/')
})

// ─── Super-admin-only route (F-06) ────────────────────────────────────────────
test('app_admin visiting /users is redirected to /403 (F-06)', async ({ page }) => {
  await page.route('**/api/admin/refresh', route =>
    route.fulfill({
      status:      200,
      contentType: 'application/json',
      body:        JSON.stringify({ access_token: 'app-admin-token', user: APP_ADMIN_USER }),
    }),
  )
  await page.route('**/api/admin/profile', route =>
    route.fulfill({
      status:      200,
      contentType: 'application/json',
      body:        JSON.stringify(APP_ADMIN_USER),
    }),
  )

  await page.goto('/users')

  await expect(page).toHaveURL('/403')
})

// ─── MFA-only route guard ─────────────────────────────────────────────────────
test('visiting /auth/mfa directly without a pending MFA challenge redirects to Login', async ({ page }) => {
  await mockRefreshFail(page)

  await page.goto('/auth/mfa')

  await expect(page).toHaveURL('/auth/login')
})
