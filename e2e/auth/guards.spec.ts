/**
 * E2E — Navigation guard behaviour (BFF cookie architecture)
 *
 * Tests the Vue Router beforeEach guard at browser level. Auth state is
 * bootstrapped from `GET /bff/session` (+ `/api/admin/profile`); there are no
 * browser-side tokens and no `/auth/callback` route.
 *
 *   • Unauthenticated user is redirected to /auth/login from any protected route
 *   • The intended path is preserved as ?redirect= for post-login restoration
 *   • Authenticated user visiting /auth/login is bounced to Dashboard
 *   • Super-admin-only routes return 403 for non-superadmin users
 */
import { test, expect } from '@playwright/test'
import {
  mockUnauthenticatedSession,
  mockAuthenticatedSession,
  ROLE_APP_ADMIN,
} from '../fixtures/api-mocks'

// ─── Unauthenticated redirects ────────────────────────────────────────────────
test('visiting / while unauthenticated redirects to /auth/login', async ({ page }) => {
  await mockUnauthenticatedSession(page)

  await page.goto('/')

  await expect(page).toHaveURL('/auth/login')
})

test('visiting a protected sub-route redirects and preserves path as ?redirect=', async ({ page }) => {
  await mockUnauthenticatedSession(page)

  await page.goto('/settings')

  // Vue Router puts the raw (unencoded) path in the redirect query param
  await expect(page).toHaveURL('/auth/login?redirect=/settings')
})

test('visiting /users while unauthenticated captures the redirect path', async ({ page }) => {
  await mockUnauthenticatedSession(page)

  await page.goto('/users')

  // Wait for async router guard to complete the redirect
  await expect(page).toHaveURL(/\/auth\/login/)

  const url = new URL(page.url())
  expect(url.pathname).toBe('/auth/login')
  expect(url.searchParams.get('redirect')).toBe('/users')
})

// ─── Authenticated user on guest route ────────────────────────────────────────
test('authenticated user visiting /auth/login is redirected to Dashboard', async ({ page }) => {
  await mockAuthenticatedSession(page)

  await page.goto('/auth/login')

  await expect(page).toHaveURL('/')
})

// ─── Super-admin-only route ───────────────────────────────────────────────────
test('non-superadmin (app_admin) visiting /users is redirected to /403', async ({ page }) => {
  await mockAuthenticatedSession(page, { role: ROLE_APP_ADMIN })

  await page.goto('/users')

  await expect(page).toHaveURL('/403')
})
