/**
 * E2E — security headers gate (F-02)
 *
 * Asserts the served app actually carries the CSP + hardening headers (here via
 * the Vite dev server, configured from src/security/csp.ts). This is the
 * presence gate: if the canonical headers stop being wired, this fails.
 */
import { test, expect } from '@playwright/test'

test('the app is served with CSP and hardening headers', async ({ page }) => {
  const response = await page.goto('/auth/login')
  const headers = response!.headers()

  const csp = headers['content-security-policy']
  expect(csp).toBeTruthy()
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).toContain("object-src 'none'")
  expect(csp).toContain("base-uri 'self'")

  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['permissions-policy']).toContain('camera=()')
})
