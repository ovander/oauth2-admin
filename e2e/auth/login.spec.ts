/**
 * E2E — Login flow (Authorization Code + PKCE)
 *
 * Login is delegated to the authorization server's hosted login. The SPA shows
 * a single "Sign in" button that redirects to /oauth/authorize; the hosted
 * login (here simulated) bounces back to /auth/callback with a code, which the
 * SPA exchanges for tokens.
 *
 * Tests the user-facing experience:
 *   • Sign-in button → AS redirect → callback → Dashboard
 *   • Login screen exposes no password field and no remember-me (F-03, F-19)
 *   • Redirect param is honoured after login (F-04)
 *   • Malicious redirect param is blocked (F-04)
 *   • A callback with no PKCE login in progress shows a failure (CSRF/replay)
 */
import { test, expect } from '@playwright/test'
import { mockPkceLogin } from '../fixtures/api-mocks'

// ─── Login happy path ─────────────────────────────────────────────────────────
test('clicking Sign in completes the PKCE flow and lands on the Dashboard', async ({ page }) => {
  await mockPkceLogin(page)

  await page.goto('/auth/login')
  await page.click('button')

  await expect(page).toHaveURL('/')
  await expect(page.locator('h1').filter({ hasText: /Welcome/ })).toBeVisible()
})

// ─── No credentials on the login screen (F-03) ────────────────────────────────
test('login screen exposes no password field — credentials are handled by the AS (F-03)', async ({ page }) => {
  await page.goto('/auth/login')

  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.locator('input[type="email"]')).toHaveCount(0)
})

// ─── No remember-me (F-19) ────────────────────────────────────────────────────
test('login screen has no remember-me checkbox (F-19)', async ({ page }) => {
  await page.goto('/auth/login')

  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0)
  const html = await page.content()
  expect(html.toLowerCase()).not.toContain('remember')
})

// ─── Safe redirect (F-04) ─────────────────────────────────────────────────────
test('valid redirect param is honoured after login', async ({ page }) => {
  await mockPkceLogin(page)

  await page.goto('/auth/login?redirect=/security')
  await page.click('button')

  await expect(page).toHaveURL('/security')
})

test('open-redirect attack via // is blocked — falls back to Dashboard (F-04)', async ({ page }) => {
  await mockPkceLogin(page)

  // %2F%2F decodes to //
  await page.goto('/auth/login?redirect=%2F%2Fevil.com')
  await page.click('button')

  await expect(page).toHaveURL('/')
})

test('absolute URL redirect is blocked — falls back to Dashboard (F-04)', async ({ page }) => {
  await mockPkceLogin(page)

  await page.goto('/auth/login?redirect=https%3A%2F%2Fattacker.com')
  await page.click('button')

  await expect(page).toHaveURL('/')
})

// ─── Callback integrity (CSRF / replay) ───────────────────────────────────────
test('a callback with no PKCE login in progress shows a failure and does not authenticate', async ({ page }) => {
  // Navigate straight to the callback without ever starting login: there is no
  // stored verifier/state, so the exchange must be refused.
  await page.goto('/auth/callback?code=forged-code&state=forged-state')

  await expect(page.getByText(/sign-in failed/i)).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/callback/)
})
