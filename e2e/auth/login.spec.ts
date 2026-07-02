/**
 * E2E — Login flow (BFF cookie architecture)
 *
 * Login is delegated to the BFF: the SPA shows a single "Sign in" button that
 * triggers a full-page navigation to `/bff/login`. The BFF runs the
 * Authorization Code + PKCE flow SERVER-SIDE, mints the HttpOnly session cookie
 * and returns the browser to `return_to`. The browser never performs PKCE or a
 * token exchange, so there is no `/auth/callback` and no in-SPA `/oauth/token`.
 *
 * Tests the user-facing experience:
 *   • Sign-in button → full-page navigation to /bff/login
 *   • Login screen exposes no password field and no remember-me (F-03, F-19)
 *   • A safe `redirect` param is forwarded as `return_to` (F-04)
 *   • A malicious `redirect` param is dropped — no `return_to` (F-04)
 */
import { test, expect } from '@playwright/test'
import { mockUnauthenticatedSession, mockBffLogin } from '../fixtures/api-mocks'

// ─── Login happy path ─────────────────────────────────────────────────────────
test('clicking Sign in triggers a full-page navigation to /bff/login', async ({ page }) => {
  await mockUnauthenticatedSession(page)
  await mockBffLogin(page)

  await page.goto('/auth/login')

  const [request] = await Promise.all([
    page.waitForRequest('**/bff/login*'),
    page.getByRole('button', { name: /sign in/i }).click(),
  ])

  const url = new URL(request.url())
  expect(url.pathname).toBe('/bff/login')
  // No redirect param present → no return_to forwarded.
  expect(url.searchParams.get('return_to')).toBeNull()
})

// ─── No credentials on the login screen (F-03) ────────────────────────────────
test('login screen exposes no password field — credentials are handled by the AS (F-03)', async ({ page }) => {
  await mockUnauthenticatedSession(page)
  await page.goto('/auth/login')

  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.locator('input[type="email"]')).toHaveCount(0)
})

// ─── No remember-me (F-19) ────────────────────────────────────────────────────
test('login screen has no remember-me checkbox (F-19)', async ({ page }) => {
  await mockUnauthenticatedSession(page)
  await page.goto('/auth/login')

  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0)
  const html = await page.content()
  expect(html.toLowerCase()).not.toContain('remember')
})

// ─── Safe redirect (F-04) ─────────────────────────────────────────────────────
test('valid redirect param is forwarded to /bff/login as return_to (F-04)', async ({ page }) => {
  await mockUnauthenticatedSession(page)
  await mockBffLogin(page)

  await page.goto('/auth/login?redirect=/security')

  const [request] = await Promise.all([
    page.waitForRequest('**/bff/login*'),
    page.getByRole('button', { name: /sign in/i }).click(),
  ])

  expect(new URL(request.url()).searchParams.get('return_to')).toBe('/security')
})

test('open-redirect attack via // is dropped — no return_to forwarded (F-04)', async ({ page }) => {
  await mockUnauthenticatedSession(page)
  await mockBffLogin(page)

  // %2F%2F decodes to //
  await page.goto('/auth/login?redirect=%2F%2Fevil.com')

  const [request] = await Promise.all([
    page.waitForRequest('**/bff/login*'),
    page.getByRole('button', { name: /sign in/i }).click(),
  ])

  expect(new URL(request.url()).searchParams.get('return_to')).toBeNull()
})

test('absolute URL redirect is dropped — no return_to forwarded (F-04)', async ({ page }) => {
  await mockUnauthenticatedSession(page)
  await mockBffLogin(page)

  await page.goto('/auth/login?redirect=https%3A%2F%2Fattacker.com')

  const [request] = await Promise.all([
    page.waitForRequest('**/bff/login*'),
    page.getByRole('button', { name: /sign in/i }).click(),
  ])

  expect(new URL(request.url()).searchParams.get('return_to')).toBeNull()
})
