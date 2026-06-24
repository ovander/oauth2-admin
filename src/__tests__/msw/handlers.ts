/**
 * MSW request handlers — canonical happy-path responses.
 *
 * Individual tests override specific routes with server.use() to simulate
 * error states (401, 403, 5xx) or alternative responses (MFA challenge).
 * server.resetHandlers() in afterEach restores these defaults.
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
  user:         ADMIN_USER,
}

export const REFRESH_RESPONSE = {
  access_token: 'refreshed-access-token',
  user:         ADMIN_USER,
}

// ─── Handlers ─────────────────────────────────────────────────────────────────
export const handlers = [
  // POST /api/admin/login ── happy-path: returns full session
  http.post(`${BASE}/api/admin/login`, async ({ request }) => {
    const body = await request.json() as { email: string; password: string }

    if (body.email === 'mfa@example.com') {
      return HttpResponse.json({ requires_mfa: true })
    }
    if (body.email === 'admin@example.com' && body.password === 'correct-password') {
      return HttpResponse.json(LOGIN_RESPONSE)
    }
    return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 })
  }),

  // POST /api/admin/mfa/verify
  http.post(`${BASE}/api/admin/mfa/verify`, async ({ request }) => {
    const body = await request.json() as { code: string }
    if (body.code === '123456') {
      return HttpResponse.json({ ...LOGIN_RESPONSE, access_token: 'mfa-access-token' })
    }
    return HttpResponse.json({ message: 'Invalid MFA code' }, { status: 401 })
  }),

  // POST /api/admin/logout ── always succeeds
  http.post(`${BASE}/api/admin/logout`, () => HttpResponse.json({})),

  // GET /api/admin/profile ── validates Bearer header presence
  http.get(`${BASE}/api/admin/profile`, ({ request }) => {
    const auth = request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }
    return HttpResponse.json(ADMIN_USER)
  }),

  // POST /api/admin/refresh ── silent cookie-based refresh (happy-path)
  http.post(`${BASE}/api/admin/refresh`, () => HttpResponse.json(REFRESH_RESPONSE)),

  // POST /api/admin/reset-password
  http.post(`${BASE}/api/admin/reset-password`, async ({ request }) => {
    const body = await request.json() as { token: string; password: string }
    if (!body.token || !body.password) {
      return HttpResponse.json({ message: 'token and password are required' }, { status: 400 })
    }
    return HttpResponse.json({})
  }),

  // POST /api/admin/request-password-reset
  http.post(`${BASE}/api/admin/request-password-reset`, () => HttpResponse.json({})),

  // PUT /api/admin/profile
  http.put(`${BASE}/api/admin/profile`, async ({ request }) => {
    const body = await request.json() as Partial<typeof ADMIN_USER>
    return HttpResponse.json({ ...ADMIN_USER, ...body })
  }),
]
