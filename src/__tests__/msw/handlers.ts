/**
 * MSW request handlers — canonical happy-path responses.
 *
 * Individual tests override specific routes with server.use() to simulate
 * error states (401, 403, 5xx) or alternative responses.
 * server.resetHandlers() in afterEach restores these defaults.
 *
 * These mirror the Socrate backend contract:
 *   • OAuth API   — /oauth/token (Authorization Code + PKCE exchange + refresh),
 *     /api/auth/* (refresh, logout), /api/profile — same gateway origin.
 *   • Admin API   — /api/admin/*   (profile, sessions, …)
 *   • Login (credentials + MFA) is delegated to the AS hosted login; the SPA
 *     only exchanges the returned authorization code at /oauth/token.
 */
import { http, HttpResponse } from 'msw'

export const BASE = 'https://api.test.example.com'

// ─── Shared fixtures ──────────────────────────────────────────────────────────
export const ADMIN_USER = {
  id:    '1',
  email: 'admin@example.com',
  name:  'Test Admin',
  role:  'super_admin',
}

export const LOGIN_RESPONSE = {
  access_token: 'test-access-token',
  token_type:   'Bearer',
  expires_in:   900,
}

export const REFRESH_RESPONSE = {
  access_token: 'refreshed-access-token',
}

// ─── Handlers ─────────────────────────────────────────────────────────────────
export const handlers = [
  // POST /oauth/token ── Authorization Code + PKCE exchange (and refresh_token grant)
  http.post(`${BASE}/oauth/token`, async ({ request }) => {
    const params = new URLSearchParams(await request.text())
    const grant  = params.get('grant_type')

    if (grant === 'authorization_code') {
      // A valid exchange carries the code + the PKCE verifier.
      if (params.get('code') && params.get('code_verifier')) {
        return HttpResponse.json(LOGIN_RESPONSE)
      }
      return HttpResponse.json({ error: 'invalid_grant' }, { status: 400 })
    }

    if (grant === 'refresh_token') {
      return HttpResponse.json(REFRESH_RESPONSE)
    }

    return HttpResponse.json({ error: 'unsupported_grant_type' }, { status: 400 })
  }),

  // POST /api/auth/logout ── public-API logout, always succeeds
  http.post(`${BASE}/api/auth/logout`, () => HttpResponse.json({})),

  // GET /api/admin/profile ── validates Bearer header presence
  http.get(`${BASE}/api/admin/profile`, ({ request }) => {
    const auth = request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return HttpResponse.json(ADMIN_USER)
  }),

  // Note: silent refresh is the /oauth/token `grant_type=refresh_token` branch
  // above (cookie Path=/oauth/token) — not a separate endpoint.

  // POST /api/auth/reset-password
  http.post(`${BASE}/api/auth/reset-password`, async ({ request }) => {
    const body = await request.json() as { token: string; password: string }
    if (!body.token || !body.password) {
      return HttpResponse.json({ error: 'token and password are required' }, { status: 400 })
    }
    return HttpResponse.json({})
  }),

  // POST /api/auth/request-password-reset
  http.post(`${BASE}/api/auth/request-password-reset`, () => HttpResponse.json({})),

  // PUT /api/profile ── public profile self-service update
  http.put(`${BASE}/api/profile`, async ({ request }) => {
    const body = await request.json() as Partial<typeof ADMIN_USER>
    return HttpResponse.json({ ...ADMIN_USER, ...body })
  }),
]
