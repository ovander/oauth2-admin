/**
 * Integration tests for api.ts — Axios interceptors (BFF cookie model).
 *
 * Uses MSW to intercept real HTTP calls made by the Axios instance. Covers the
 * paths that could NOT be tested with vi.mock() in unit tests:
 *
 *   • Request interceptor: NO Authorization header (the BFF injects the bearer);
 *     X-CSRF-Token attached on unsafe methods; X-Requested-By always sent.
 *   • Response interceptor: 401 → clear CSRF + redirect to Login (no client-side
 *     refresh — the BFF refreshes server-side).
 *   • Response interceptor: 403 elevation_required → step-up → retry once.
 *   • Response interceptor: 403 password_change_required → flag.
 *   • Response interceptor: 403 / 5xx pass through.
 */
import { describe, it, expect, beforeEach, vi }  from 'vitest'
import { http, HttpResponse }                     from 'msw'
import { server }                                 from '../msw/server'
import { BASE }                                   from '../msw/handlers'

// ── Import the REAL api module + CSRF store (not mocked) ──────────────────────
import api from '@/services/api'
import { csrfStore } from '@/services/session'

// ── Import router so we can spy on router.push ────────────────────────────────
import router from '@/router/router'

// ── Mock only requireElevation (the UI prompt) so the step-up path is testable;
//    challengeCode + the password-change flag stay real. ───────────────────────
vi.mock('@/services/adminGuards', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/adminGuards')>()
  return { ...actual, requireElevation: vi.fn() }
})
import {
  requireElevation,
  passwordChangeRequired,
  clearPasswordChangeRequired,
} from '@/services/adminGuards'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const TEST_URL = `${BASE}/api/test-resource`

function ok200()    { return HttpResponse.json({ result: 'ok' }) }
function auth401()  { return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }) }
function err403()   { return HttpResponse.json({ message: 'Forbidden' }, { status: 403 }) }
function err500()   { return HttpResponse.json({ message: 'Server error' }, { status: 500 }) }

// ─────────────────────────────────────────────────────────────────────────────
describe('api.ts — request interceptor', () => {
  beforeEach(() => {
    csrfStore.clear()
    server.use(http.get(TEST_URL, ok200))
  })

  it('NEVER attaches an Authorization header (the BFF injects the bearer)', async () => {
    let captured: string | null = 'should-be-absent'
    csrfStore.set('csrf-1')

    server.use(
      http.get(TEST_URL, ({ request }) => {
        captured = request.headers.get('Authorization')
        return ok200()
      }),
    )

    await api.get('/api/test-resource')

    expect(captured).toBeNull()
  })

  it('attaches X-CSRF-Token on unsafe methods when a CSRF token is present', async () => {
    let captured: string | null = null
    csrfStore.set('csrf-token-123')

    server.use(
      http.post(`${BASE}/api/admin/thing`, ({ request }) => {
        captured = request.headers.get('X-CSRF-Token')
        return ok200()
      }),
    )

    await api.post('/api/admin/thing', {})

    expect(captured).toBe('csrf-token-123')
  })

  it('does NOT attach X-CSRF-Token on safe (GET) requests', async () => {
    let captured: string | null = 'present'
    csrfStore.set('csrf-token-123')

    server.use(
      http.get(TEST_URL, ({ request }) => {
        captured = request.headers.get('X-CSRF-Token')
        return ok200()
      }),
    )

    await api.get('/api/test-resource')

    expect(captured).toBeNull()
  })

  it('always sends the X-Requested-By header (forwarded by the BFF, F-16)', async () => {
    let captured: string | null = null

    server.use(
      http.get(TEST_URL, ({ request }) => {
        captured = request.headers.get('X-Requested-By')
        return ok200()
      }),
    )

    await api.get('/api/test-resource')

    expect(captured).toBe('oauth2-admin')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('api.ts — response interceptor: 401 → Login (no client refresh)', () => {
  beforeEach(() => { csrfStore.set('csrf-1') })

  it('clears CSRF and redirects to Login on 401', async () => {
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined)
    server.use(http.get(TEST_URL, auth401))

    await expect(api.get('/api/test-resource')).rejects.toMatchObject({
      response: { status: 401 },
    })

    expect(csrfStore.get()).toBeNull()
    expect(pushSpy).toHaveBeenCalledWith({ name: 'Login' })

    pushSpy.mockRestore()
  })

  it('does NOT bounce to Login on a change-password 401 (form error)', async () => {
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined)
    server.use(
      http.post(`${BASE}/api/admin/change-password`, () =>
        HttpResponse.json({ message: 'Current password is incorrect' }, { status: 401 }),
      ),
    )

    await expect(api.post('/api/admin/change-password', {})).rejects.toMatchObject({
      response: { status: 401 },
    })
    expect(pushSpy).not.toHaveBeenCalled()

    pushSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('api.ts — response interceptor: non-401 errors pass through', () => {
  it('rejects 403 (no challenge) without retry', async () => {
    server.use(http.get(TEST_URL, err403))
    await expect(api.get('/api/test-resource')).rejects.toMatchObject({
      response: { status: 403 },
    })
  })

  it('rejects 500 unchanged', async () => {
    server.use(http.get(TEST_URL, err500))
    await expect(api.get('/api/test-resource')).rejects.toMatchObject({
      response: { status: 500 },
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('api.ts — response interceptor: 403 step-up / forced password change', () => {
  beforeEach(() => {
    csrfStore.set('csrf-1')
    clearPasswordChangeRequired()
    vi.mocked(requireElevation).mockReset()
  })

  function elevationRequired() { return HttpResponse.json({ error: 'elevation_required' }, { status: 403 }) }
  function pwChangeRequired()  { return HttpResponse.json({ error: 'password_change_required' }, { status: 403 }) }

  it('prompts for step-up on 403 elevation_required and retries once (BFF re-elevates)', async () => {
    // The prompt resolves once /bff/elevate has elevated the session; the
    // retried request carries no new header — the BFF injects the elevated token.
    vi.mocked(requireElevation).mockResolvedValueOnce(undefined)

    let calls = 0
    server.use(
      http.get(TEST_URL, () => {
        calls++
        return calls === 1 ? elevationRequired() : ok200()
      }),
    )

    const res = await api.get('/api/test-resource')

    expect(res.status).toBe(200)
    expect(requireElevation).toHaveBeenCalledTimes(1)
    expect(calls).toBe(2)
  })

  it('rejects the request when the admin cancels the step-up prompt', async () => {
    vi.mocked(requireElevation).mockRejectedValueOnce(new Error('cancelled'))
    server.use(http.get(TEST_URL, elevationRequired))

    await expect(api.get('/api/test-resource')).rejects.toMatchObject({
      response: { status: 403, data: { error: 'elevation_required' } },
    })
  })

  it('does NOT re-prompt twice (single retry) if elevation_required persists', async () => {
    vi.mocked(requireElevation).mockResolvedValueOnce(undefined)
    let hits = 0
    server.use(http.get(TEST_URL, () => { hits++; return elevationRequired() }))

    await expect(api.get('/api/test-resource')).rejects.toMatchObject({ response: { status: 403 } })
    expect(hits).toBe(2)                       // original + one retry, no loop
    expect(requireElevation).toHaveBeenCalledTimes(1)
  })

  it('flags forced password change on 403 password_change_required', async () => {
    server.use(http.get(TEST_URL, pwChangeRequired))

    expect(passwordChangeRequired.value).toBe(false)
    await expect(api.get('/api/test-resource')).rejects.toMatchObject({
      response: { status: 403, data: { error: 'password_change_required' } },
    })
    expect(passwordChangeRequired.value).toBe(true)

    clearPasswordChangeRequired()
  })
})
