/**
 * Integration tests for authService.ts.
 *
 * These tests call the real authService functions through the real Axios
 * instance — no vi.mock().  MSW intercepts HTTP requests at the network layer.
 *
 * Covered:
 *   login()              — success, MFA re-submit (mfa_required → code), wrong creds
 *   logout()             — swallows server errors (fire-and-forget contract)
 *   getProfile()         — success, bearer token forwarded
 *   resetPassword()      — token sent in request body (not URL) — F-08
 *   requestPasswordReset — happy path
 *   updateProfile()      — partial update merged
 */
import { describe, it, expect, beforeEach }  from 'vitest'
import { http, HttpResponse }                from 'msw'
import { server }                            from '../msw/server'
import { BASE, ADMIN_USER }  from '../msw/handlers'

import * as authService  from '@/services/authService'
import { tokenStore }    from '@/services/api'

// ─────────────────────────────────────────────────────────────────────────────
beforeEach(() => {
  tokenStore.clear()
})

// ─────────────────────────────────────────────────────────────────────────────
describe('authService — login()', () => {
  it('returns the session response on valid credentials', async () => {
    const result = await authService.login({ email: 'admin@example.com', password: 'correct-password' })

    expect(result).toMatchObject({ access_token: 'test-access-token' })
  })

  it('rejects with 401 mfa_required when the admin has MFA and sends no code', async () => {
    await expect(
      authService.login({ email: 'mfa@example.com', password: 'any' }),
    ).rejects.toMatchObject({ response: { status: 401, data: { error: 'mfa_required' } } })
  })

  it('completes login when the same credentials are re-submitted with a valid mfa_code', async () => {
    const result = await authService.login({
      email: 'mfa@example.com', password: 'any', mfa_code: '123456',
    })

    expect(result).toMatchObject({ access_token: 'mfa-access-token' })
  })

  it('rejects with 401 invalid mfa code for a wrong mfa_code', async () => {
    await expect(
      authService.login({ email: 'mfa@example.com', password: 'any', mfa_code: '000000' }),
    ).rejects.toMatchObject({ response: { status: 401, data: { error: 'invalid mfa code' } } })
  })

  it('throws an AxiosError (401) for invalid credentials', async () => {
    await expect(
      authService.login({ email: 'bad@example.com', password: 'wrong' }),
    ).rejects.toMatchObject({ response: { status: 401 } })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('authService — logout()', () => {
  it('resolves without throwing on a 200 response', async () => {
    await expect(authService.logout()).resolves.toBeUndefined()
  })

  it('swallows a 500 error — fire-and-forget contract', async () => {
    server.use(
      http.post(`${BASE}/api/auth/logout`, () =>
        HttpResponse.json({ error: 'Internal server error' }, { status: 500 }),
      ),
    )
    // Must NOT throw — authStore always clears local state regardless
    await expect(authService.logout()).resolves.toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('authService — getProfile()', () => {
  it('returns the user profile when a valid Bearer token is in memory', async () => {
    tokenStore.set('test-access-token')

    const profile = await authService.getProfile()

    expect(profile).toMatchObject({ email: 'admin@example.com', role: 'super_admin' })
  })

  it('throws when no Bearer token is present and the refresh cookie is absent', async () => {
    // The api interceptor catches the 401 and attempts a silent refresh.
    // Override the refresh endpoint to simulate no valid refresh cookie,
    // so the original 401 propagates to the caller.
    server.use(
      http.post(`${BASE}/api/auth/refresh`, () =>
        HttpResponse.json({ error: 'No valid session' }, { status: 401 }),
      ),
    )
    // tokenStore already cleared in beforeEach
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
    tokenStore.set('test-access-token')

    const result = await authService.updateProfile({ name: 'New Name' })

    expect(result).toMatchObject({ ...ADMIN_USER, name: 'New Name' })
  })
})
