/**
 * E2E — Password reset flow
 *
 * Verifies the security properties of the reset-password view at browser level:
 *   • Token is consumed from the URL fragment (#token=<value>) — F-08
 *   • Fragment is removed from the URL after the token is extracted
 *   • Reset token is sent in the POST body, never in the URL — F-08
 *   • No-token state shows an error and disables the form
 *   • Password submit calls the API only when a token is present
 *
 * Fragment format: the view expects #token=<value> (matches /[#&]token=([^&]+)/).
 * Password-length validation is enforced by Vue's validate() on submit,
 * not by disabling the submit button (which is only disabled when !resetToken).
 */
import { test, expect }      from '@playwright/test'
import { mockRefreshFail }   from '../fixtures/api-mocks'

const VALID_PASSWORD = 'Str0ng!Pass1234X'  // 16 characters

// ─── Fragment token ───────────────────────────────────────────────────────────
test('token read from URL fragment (#token=) enables the form (F-08)', async ({ page }) => {
  await mockRefreshFail(page)
  await page.route('**/api/admin/reset-password', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )

  // Fragment must be #token=<value> — the component uses /[#&]token=([^&]+)/
  await page.goto('/auth/reset-password#token=my-secret-reset-token')

  // The submit button should be enabled (resetToken was found)
  const submitBtn = page.locator('button[type="submit"]')
  await expect(submitBtn).toBeEnabled()
})

test('URL fragment is stripped from address bar after token extraction (F-08)', async ({ page }) => {
  await mockRefreshFail(page)

  await page.goto('/auth/reset-password#token=strip-me-token')

  // Wait for the component to mount and call history.replaceState
  await page.waitForFunction(
    () => !window.location.hash,
    { timeout: 5_000 },
  )

  expect(page.url()).not.toContain('#')
})

test('no token: form is disabled and an error message is shown', async ({ page }) => {
  await mockRefreshFail(page)

  await page.goto('/auth/reset-password')

  // No token → the error message should be visible
  await expect(page.locator('[role="alert"]')).toBeVisible()

  // Submit button disabled when resetToken is null
  const submitBtn = page.locator('button[type="submit"]')
  await expect(submitBtn).toBeDisabled()
})

// ─── Token sent in body (F-08) ────────────────────────────────────────────────
test('reset token is sent in the request body, never in the URL (F-08)', async ({ page }) => {
  await mockRefreshFail(page)

  let capturedBody: Record<string, string> = {}
  let capturedUrl  = ''

  await page.route('**/api/admin/reset-password', async route => {
    const request = route.request()
    capturedUrl  = request.url()
    capturedBody = JSON.parse(request.postData() ?? '{}')
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/auth/reset-password#token=my-reset-body-token')

  // Wait for form to be enabled (token was found)
  await expect(page.locator('button[type="submit"]')).toBeEnabled()

  await page.locator('input[type="password"]').nth(0).fill(VALID_PASSWORD)
  await page.locator('input[type="password"]').nth(1).fill(VALID_PASSWORD)
  await page.locator('button[type="submit"]').click()

  // Token must be in the body, not in the URL
  await page.waitForFunction(() => true)  // allow any API calls to settle
  expect(capturedBody.token).toBe('my-reset-body-token')
  expect(capturedBody.password).toBe(VALID_PASSWORD)
  expect(capturedUrl).not.toContain('my-reset-body-token')
})

// ─── Password validation (F-21) ──────────────────────────────────────────────
test('short password triggers a validation error on submit (F-21)', async ({ page }) => {
  await mockRefreshFail(page)

  await page.goto('/auth/reset-password#token=some-token')

  // Wait for form to be enabled
  await expect(page.locator('button[type="submit"]')).toBeEnabled()

  // 8-character password — below the 16-char minimum
  await page.locator('input[type="password"]').nth(0).fill('Short123')
  await page.locator('input[type="password"]').nth(1).fill('Short123')
  await page.locator('button[type="submit"]').click()

  // Vue validate() should produce an error message
  await expect(page.locator('small').first()).toBeVisible()
  await expect(page.locator('small').first()).toContainText('16 characters')
})

test('mismatched passwords triggers a validation error on submit', async ({ page }) => {
  await mockRefreshFail(page)

  await page.goto('/auth/reset-password#token=some-token')

  await expect(page.locator('button[type="submit"]')).toBeEnabled()

  await page.locator('input[type="password"]').nth(0).fill(VALID_PASSWORD)
  await page.locator('input[type="password"]').nth(1).fill(VALID_PASSWORD + 'x')
  await page.locator('button[type="submit"]').click()

  await expect(page.locator('small').filter({ hasText: /match|confirm/i }).first()).toBeVisible()
})
