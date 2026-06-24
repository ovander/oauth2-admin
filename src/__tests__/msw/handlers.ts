/**
 * MSW request handlers — canonical happy-path responses.
 *
 * Individual tests override specific routes with server.use() to simulate
 * error states (401, 403, 5xx) or alternative responses.
 * server.resetHandlers() in afterEach restores these defaults.
 *
 * These mirror the Socrate backend contract:
 *   • Admin API        — /api/admin/*   (login, profile, sessions, …)
 *   • Public OAuth API — /api/auth/*, /api/profile (refresh, logout,
 *     password reset, profile self-service) — same gateway origin.
 *   • Admin MFA is a stateless re-submit of /api/admin/login with `mfa_code`;
 *     a credentials-only attempt by an MFA admin gets 401 { error: 'mfa_required' }.
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
  // POST /api/admin/login ── credentials + optional MFA re-submit
  http.post(`${BASE}/api/admin/login`, async ({ request }) => {
    const body = await request.json() as { email: string; password: string; mfa_code?: string }

    // MFA-enabled admin: credentials alone are not enough.
    if (body.email === 'mfa@example.com') {
      if (!body.mfa_code) {
        return HttpResponse.json({ error: 'mfa_required' }, { status: 401 })
      }
      if (body.mfa_code === '123456') {
        return HttpResponse.json({ ...LOGIN_RESPONSE, access_token: 'mfa-access-token' })
      }
      return HttpResponse.json({ error: 'invalid mfa code' }, { status: 401 })
    }

    if (body.email === 'admin@example.com' && body.password === 'correct-password') {
      return HttpResponse.json(LOGIN_RESPONSE)
    }
    return HttpResponse.json({ error: 'invalid credentials' }, { status: 401 })
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

  // POST /api/auth/refresh ── silent cookie-based refresh (happy-path)
  http.post(`${BASE}/api/auth/refresh`, () => HttpResponse.json(REFRESH_RESPONSE)),

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
