/**
 * E2E — Login flow
 *
 * Tests the user-facing authentication experience:
 *   • Valid credentials → Dashboard
 *   • MFA challenge → MFA verify page → Dashboard
 *   • Wrong credentials → inline error shown
 *   • Form validation (empty fields)
 *   • No remember-me checkbox exposed (F-19)
 *   • Redirect param is honoured after login (F-04)
 *   • Malicious redirect param is blocked (F-04)
 *
 * Note on email format validation:
 *   LoginView uses <InputText type="email">.  In a real Chromium browser,
 *   native HTML5 form validation fires before the Vue submit handler, so
 *   Vue's regex check is never reached for a non-email string.  The correct
 *   assertion is that the API was NOT called — not that a Vue error message
 *   appears.  We test this via the empty-field path instead.
 */
import { test, expect } from '@playwright/test'
import {
  mockLoginSuccess,
  mockLoginFail,
  mockLoginMfaChallenge,
  mockMfaVerifySuccess,
  mockRefreshFail,
} from '../fixtures/api-mocks'

// ─── Login happy path ─────────────────────────────────────────────────────────
test('successful login navigates to the Dashboard', async ({ page }) => {
  await mockLoginSuccess(page)

  await page.goto('/auth/login')
  await page.fill('input[type="email"]',    'admin@example.com')
  await page.fill('input[type="password"]', 'correct-password')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/')
  // Two h1 elements live on the Dashboard (sidebar + page heading); use filter
  await expect(page.locator('h1').filter({ hasText: /Welcome/ })).toBeVisible()
})

// ─── MFA flow ─────────────────────────────────────────────────────────────────
test('MFA challenge redirects to /auth/mfa, correct code completes login', async ({ page }) => {
  await mockLoginMfaChallenge(page)
  await mockMfaVerifySuccess(page)

  await page.goto('/auth/login')
  await page.fill('input[type="email"]',    'mfa@example.com')
  await page.fill('input[type="password"]', 'any-password')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/auth/mfa')

  await page.fill('input[type="text"]', '123456')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/')
})

// ─── Invalid credentials ──────────────────────────────────────────────────────
test('wrong credentials shows an error message without navigating', async ({ page }) => {
  await mockLoginFail(page)

  await page.goto('/auth/login')
  await page.fill('input[type="email"]',    'admin@example.com')
  await page.fill('input[type="password"]', 'wrong-password')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/auth/login')
  // api.ts interceptor no longer swallows auth-flow 401s, so the server's
  // error message ("Invalid credentials") reaches the UI directly
  await expect(page.locator('[role="alert"]')).toBeVisible()
  await expect(page.locator('[role="alert"]')).toContainText('Invalid credentials')
})

// ─── Form validation ──────────────────────────────────────────────────────────
test('empty email field shows a validation message and does not call the API', async ({ page }) => {
  let loginCalled = false
  await page.route('**/api/admin/login', () => { loginCalled = true })

  await page.goto('/auth/login')
  // Leave email empty, fill password only
  await page.fill('input[type="password"]', 'some-password')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/auth/login')
  expect(loginCalled).toBe(false)
  // Vue error message rendered inside a <small> tag
  await expect(page.locator('small').first()).toBeVisible()
  await expect(page.locator('small').first()).toContainText('required')
})

test('empty password field shows a validation message and does not call the API', async ({ page }) => {
  let loginCalled = false
  await page.route('**/api/admin/login', () => { loginCalled = true })

  await page.goto('/auth/login')
  await page.fill('input[type="email"]', 'admin@example.com')
  // Leave password empty and submit
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/auth/login')
  expect(loginCalled).toBe(false)
})

// ─── No remember-me (F-19) ────────────────────────────────────────────────────
test('login form has no remember-me checkbox (F-19)', async ({ page }) => {
  await mockRefreshFail(page)

  await page.goto('/auth/login')

  const checkboxes = page.locator('input[type="checkbox"]')
  await expect(checkboxes).toHaveCount(0)

  const html = await page.content()
  expect(html.toLowerCase()).not.toContain('remember')
})

// ─── Safe redirect (F-04) ─────────────────────────────────────────────────────
test('valid redirect param is honoured after login', async ({ page }) => {
  await mockLoginSuccess(page)

  await page.goto('/auth/login?redirect=/security')
  await page.fill('input[type="email"]',    'admin@example.com')
  await page.fill('input[type="password"]', 'correct-password')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/security')
})

test('open-redirect attack via // is blocked — falls back to Dashboard (F-04)', async ({ page }) => {
  await mockLoginSuccess(page)

  // %2F%2F decodes to //
  await page.goto('/auth/login?redirect=%2F%2Fevil.com')
  await page.fill('input[type="email"]',    'admin@example.com')
  await page.fill('input[type="password"]', 'correct-password')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/')
})

test('absolute URL redirect is blocked — falls back to Dashboard (F-04)', async ({ page }) => {
  await mockLoginSuccess(page)

  await page.goto('/auth/login?redirect=https%3A%2F%2Fattacker.com')
  await page.fill('input[type="email"]',    'admin@example.com')
  await page.fill('input[type="password"]', 'correct-password')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/')
})
