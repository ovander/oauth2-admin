/**
 * Integration tests for authService.ts.
 *
 * These tests call the real authService functions through the real Axios
 * instances — no vi.mock(). MSW intercepts HTTP requests at the network layer.
 *
 * Covered (BFF cookie model):
 *   getProfile()         — admin profile via the BFF (no bearer in the browser)
 *   resetPassword()      — token sent in request body (not URL) — F-08
 *   requestPasswordReset — happy path
 *   updateProfile()      — partial update merged
 *   changePassword()     — current+new sent; wrong current → 401 (no Login bounce)
 *
 * Login, logout and step-up elevation are BFF flows (services/session.ts) and
 * are covered by session.spec.ts and authStore.spec.ts.
 */
import { describe, it, expect }  from 'vitest'
import { http, HttpResponse }    from 'msw'
import { server }                from '../msw/server'
import { BASE, ADMIN_USER }      from '../msw/handlers'

import * as authService  from '@/services/authService'

// ─────────────────────────────────────────────────────────────────────────────
describe('authService — getProfile()', () => {
  it('returns the admin profile (cookie-authenticated through the BFF)', async () => {
    const profile = await authService.getProfile()

    expect(profile).toMatchObject({ email: 'admin@example.com', role: 'super_admin' })
  })

  it('propagates a 401 when the session is gone', async () => {
    server.use(
      http.get(`${BASE}/api/admin/profile`, () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      ),
    )
    await expect(authService.getProfile()).rejects.toMatchObject({
      response: { status: 401 },
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('authService — resetPassword() — F-08 token-in-body', () => {
  it('sends the reset token in the request BODY, never in the URL', async () => {
    let capturedBody: Record<string, unknown> = {}
    let capturedUrl  = ''

    server.use(
      http.post(`${BASE}/api/auth/reset-password`, async ({ request }) => {
        capturedUrl  = request.url
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({})
      }),
    )

    await authService.resetPassword('my-secret-reset-token', 'NewP@ss1234567890')

    // Token must be in the body
    expect(capturedBody.token).toBe('my-secret-reset-token')
    expect(capturedBody.password).toBe('NewP@ss1234567890')

    // Token must NOT appear in the URL (query string or path)
    expect(capturedUrl).not.toContain('my-secret-reset-token')
  })

  it('throws 400 when the body is missing required fields', async () => {
    server.use(
      http.post(`${BASE}/api/auth/reset-password`, () =>
        HttpResponse.json({ error: 'token and password are required' }, { status: 400 }),
      ),
    )

    // Intentionally passing empty strings to trigger the 400
    await expect(
      authService.resetPassword('', ''),
    ).rejects.toMatchObject({ response: { status: 400 } })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('authService — requestPasswordReset()', () => {
  it('resolves without throwing on success', async () => {
    await expect(
      authService.requestPasswordReset('admin@example.com'),
    ).resolves.toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('authService — updateProfile()', () => {
  it('sends the partial update and returns the merged user object', async () => {
    const result = await authService.updateProfile({ name: 'New Name' })

    expect(result).toMatchObject({ ...ADMIN_USER, name: 'New Name' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('authService — changePassword()', () => {
  it('sends current + new password and resolves on success', async () => {
    let captured: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/api/admin/change-password`, async ({ request }) => {
        captured = await request.json() as Record<string, unknown>
        return HttpResponse.json({})
      }),
    )

    await expect(
      authService.changePassword('correct-password', 'NewP@ss1234567890'),
    ).resolves.toBeUndefined()
    expect(captured).toEqual({ current_password: 'correct-password', new_password: 'NewP@ss1234567890' })
  })

  it('rejects 401 for a wrong current password WITHOUT bouncing to Login', async () => {
    // The 401-redirect interceptor must exempt change-password (form error, not
    // session expiry), so the error reaches the caller for inline display.
    await expect(
      authService.changePassword('wrong-current', 'NewP@ss1234567890'),
    ).rejects.toMatchObject({ response: { status: 401 } })
  })
})
