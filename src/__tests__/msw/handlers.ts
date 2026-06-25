/**
 * MSW request handlers — canonical happy-path responses.
 *
 * Individual tests override specific routes with server.use() to simulate
 * error states (401, 403, 5xx) or alternative responses.
 * server.resetHandlers() in afterEach restores these defaults.
 *
 * These mirror the BFF + Socrate backend contract under the cookie-session
 * model:
 *   • BFF control plane — /bff/session, /bff/logout, /bff/elevate (same-origin).
 *   • Admin API   — /api/admin/*  reached through the BFF; the browser sends the
 *     session cookie (no bearer — the BFF injects it server-side).
 *   • Issuer API  — /api/auth/* (reset), /api/profile — public/pre-auth flows.
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
  // ── BFF control plane (same-origin) ──────────────────────────────────────────
  // GET /bff/session ── authenticated bootstrap + CSRF token
  http.get('/bff/session', () =>
    HttpResponse.json({
      authenticated: true,
      user: { sub: '1', email: ADMIN_USER.email, name: ADMIN_USER.name, roles: ['super_admin'] },
      csrf: 'test-csrf-token',
    }),
  ),
  // POST /bff/logout ── revoke session
  http.post('/bff/logout', () => new HttpResponse(null, { status: 204 })),
  // POST /bff/elevate ── server-side step-up
  http.post('/bff/elevate', async ({ request }) => {
    const body = await request.json() as { password?: string; mfa_code?: string }
    if (body.password === 'correct-password') {
      return new HttpResponse(null, { status: 204 })
    }
    if (!body.mfa_code) {
      return HttpResponse.json({ error: 'mfa_required' }, { status: 401 })
    }
    return HttpResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }),

  // GET /api/admin/profile ── cookie-authenticated (no bearer in the browser;
  // the BFF injects it server-side, so MSW does not check Authorization here).
  http.get(`${BASE}/api/admin/profile`, () => HttpResponse.json(ADMIN_USER)),

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

  // POST /api/admin/elevate ── step-up re-auth → fresh access token
  http.post(`${BASE}/api/admin/elevate`, async ({ request }) => {
    const body = await request.json() as { password?: string; mfa_code?: string }
    if (body.password === 'correct-password') {
      return HttpResponse.json({ access_token: 'elevated-access-token', token_type: 'Bearer', expires_in: 300 })
    }
    return HttpResponse.json({ error: 'invalid credentials' }, { status: 401 })
  }),

  // POST /api/admin/change-password ── forced/self-service change
  http.post(`${BASE}/api/admin/change-password`, async ({ request }) => {
    const body = await request.json() as { current_password?: string; new_password?: string }
    if (!body.current_password || !body.new_password) {
      return HttpResponse.json({ error: 'current and new password required' }, { status: 400 })
    }
    if (body.current_password !== 'correct-password') {
      return HttpResponse.json({ message: 'Current password is incorrect' }, { status: 401 })
    }
    return HttpResponse.json({})
  }),

  // PUT /api/profile ── public profile self-service update
  http.put(`${BASE}/api/profile`, async ({ request }) => {
    const body = await request.json() as Partial<typeof ADMIN_USER>
    return HttpResponse.json({ ...ADMIN_USER, ...body })
  }),
]
