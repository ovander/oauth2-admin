/**
 * E2E — Forced password change (ADMIN-SPA-MIGRATION.md §6)
 *
 * When the admin must change their password, the BFF session is valid but every
 * `/api/admin/*` call returns `403 password_change_required`. The axios
 * interceptor flags the gate; the router guard then forces EVERY route to the
 * change-password page. On a successful change the backend revokes all tokens
 * (session dies) and the SPA bounces to a fresh login with a success notice.
 */
import { test, expect } from '@playwright/test'
import { mockMustChangePassword } from '../fixtures/api-mocks'

test('a must-change-password admin is forced to change-password, then back to login', async ({ page }) => {
  await mockMustChangePassword(page)

  // Any entry point is gated to the change-password page.
  await page.goto('/')
  await expect(page).toHaveURL('/auth/change-password')

  // current, new, confirm
  const passwords = page.locator('input[type="password"]')
  await passwords.nth(0).fill('OldP@ssw0rd!')
  await passwords.nth(1).fill('NewP@ssw0rd!')
  await passwords.nth(2).fill('NewP@ssw0rd!')
  await page.click('button[type="submit"]')

  // Tokens revoked server-side → fresh login with a success notice.
  await expect(page).toHaveURL(/\/auth\/login\?changed=1/)
  await expect(page.getByText(/password was updated/i)).toBeVisible()
})

test('the forced change-password page blocks navigation away to admin routes', async ({ page }) => {
  await mockMustChangePassword(page)

  await page.goto('/security')
  await expect(page).toHaveURL('/auth/change-password')
})
