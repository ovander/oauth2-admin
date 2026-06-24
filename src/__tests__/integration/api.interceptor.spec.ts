/**
 * Integration tests for api.ts — Axios interceptors.
 *
 * Uses MSW (Mock Service Worker) to intercept real HTTP calls made by the
 * Axios instance.  This covers the code paths that could NOT be tested with
 * vi.mock() in unit tests:
 *
 *   • Request interceptor: Bearer token attachment
 *   • Response interceptor: 401 → silent refresh → retry original request
 *   • Response interceptor: concurrent 401s are queued (single refresh)
 *   • Response interceptor: refresh failure → clear token + redirect to Login
 *   • Response interceptor: 403 / 5xx do NOT trigger a refresh
 *   • processQueue: resolves queued requests after successful refresh
 *   • processQueue: rejects queued requests when refresh fails
 */
import { describe, it, expect, beforeEach, vi }  from 'vitest'
import { http, HttpResponse }                     from 'msw'
import { server }                                 from '../msw/server'
import { BASE, REFRESH_RESPONSE }                 from '../msw/handlers'

// ── Import the REAL api module and tokenStore (not mocked) ────────────────────
import api, { tokenStore } from '@/services/api'

// ── Import router so we can spy on router.push ────────────────────────────────
import router from '@/router/router'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const TEST_URL    = `${BASE}/api/test-resource`
// The api.ts interceptor refreshes against the public OAuth API endpoint.
const REFRESH_URL = `${BASE}/api/auth/refresh`

function ok200()    { return HttpResponse.json({ result: 'ok' }) }
function auth401()  { return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }) }
function err403()   { return HttpResponse.json({ message: 'Forbidden' }, { status: 403 }) }
function err500()   { return HttpResponse.json({ message: 'Server error' }, { status: 500 }) }

// ─────────────────────────────────────────────────────────────────────────────
describe('api.ts — request interceptor', () => {
  beforeEach(() => {
    tokenStore.clear()
    server.use(http.get(TEST_URL, ok200))
  })

  it('attaches Authorization: Bearer <token> when a token is in memory', async () => {
    let captured: string | null = null

    server.use(
      http.get(TEST_URL, ({ request }) => {
        captured = request.headers.get('Authorization')
        return ok200()
      }),
    )

    tokenStore.set('my-secret-token')
    await api.get('/api/test-resource')

    expect(captured).toBe('Bearer my-secret-token')
  })

  it('omits the Authorization header when no token is stored', async () => {
    let captured: string | null = 'should-be-absent'

    server.use(
      http.get(TEST_URL, ({ request }) => {
        captured = request.headers.get('Authorization')
        return ok200()
      }),
    )

    // tokenStore is already cleared in beforeEach
    await api.get('/api/test-resource')

    expect(captured).toBeNull()
  })

  it('always sends the X-Requested-By header (lightweight CSRF mitigation F-16)', async () => {
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
describe('api.ts — response interceptor: 401 → silent refresh', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  it('calls /api/auth/refresh and retries the original request on 401', async () => {
    let callCount   = 0
    let refreshHits = 0
    const capturedTokens: string[] = []

    server.use(
      http.get(TEST_URL, ({ request }) => {
        callCount++
        capturedTokens.push(request.headers.get('Authorization') ?? 'none')
        // First call → 401; second call (retry) → 200
        return callCount === 1 ? auth401() : ok200()
      }),
      http.post(REFRESH_URL, () => {
        refreshHits++
        return HttpResponse.json({ ...REFRESH_RESPONSE, access_token: 'new-token-after-refresh' })
      }),
    )

    const response = await api.get('/api/test-resource')

    expect(response.status).toBe(200)
    expect(refreshHits).toBe(1)
    // Retry request must use the freshly obtained token
    expect(capturedTokens[1]).toBe('Bearer new-token-after-refresh')
    // tokenStore must be updated
    expect(tokenStore.get()).toBe('new-token-after-refresh')
  })

  it('queues concurrent 401 requests and issues only ONE refresh call', async () => {
    let refreshCalls = 0
    let aCalls       = 0
    let bCalls       = 0

    server.use(
      http.get(`${BASE}/api/resource-a`, () => {
        aCalls++
        return aCalls === 1 ? auth401() : HttpResponse.json({ from: 'a' })
      }),
      http.get(`${BASE}/api/resource-b`, () => {
        bCalls++
        return bCalls === 1 ? auth401() : HttpResponse.json({ from: 'b' })
      }),
      http.post(REFRESH_URL, () => {
        refreshCalls++
        return HttpResponse.json({ ...REFRESH_RESPONSE, access_token: 'shared-refresh-token' })
      }),
    )

    // Issue both requests before either resolves
    const [r1, r2] = await Promise.all([
      api.get('/api/resource-a'),
      api.get('/api/resource-b'),
    ])

    // The defining assertion: exactly ONE refresh, not two
    expect(refreshCalls).toBe(1)
    expect(r1.data).toEqual({ from: 'a' })
    expect(r2.data).toEqual({ from: 'b' })
  })

  it('clears the token and redirects to Login when refresh returns 401', async () => {
    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined)

    server.use(
      http.get(TEST_URL,    () => auth401()),
      http.post(REFRESH_URL, () => HttpResponse.json({ message: 'Session expired' }, { status: 401 })),
    )

    tokenStore.set('stale-token')

    await expect(api.get('/api/test-resource')).rejects.toThrow()

    expect(tokenStore.get()).toBeNull()
    expect(pushSpy).toHaveBeenCalledWith({ name: 'Login' })

    pushSpy.mockRestore()
  })

  it('rejects all queued requests when refresh fails', async () => {
    server.use(
      http.get(`${BASE}/api/resource-a`, () => auth401()),
      http.get(`${BASE}/api/resource-b`, () => auth401()),
      http.post(REFRESH_URL,             () => HttpResponse.json({}, { status: 401 })),
    )

    vi.spyOn(router, 'push').mockResolvedValue(undefined)

    const [r1, r2] = await Promise.allSettled([
      api.get('/api/resource-a'),
      api.get('/api/resource-b'),
    ])

    expect(r1.status).toBe('rejected')
    expect(r2.status).toBe('rejected')

    vi.restoreAllMocks()
  })

  it('does NOT retry a request that already has _retry=true (prevents infinite loops)', async () => {
    let hits = 0

    server.use(
      // Always returns 401 — should not refresh-loop
      http.get(TEST_URL, () => { hits++; return auth401() }),
      http.post(REFRESH_URL, () => {
        // Refresh returns new token
        return HttpResponse.json(REFRESH_RESPONSE)
      }),
    )

    // The first call should get 401, trigger refresh, retry (hit=2), get 401 again → reject
    await expect(api.get('/api/test-resource')).rejects.toThrow()
    // Exactly 2 hits: original + 1 retry — NOT an infinite loop
    expect(hits).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('api.ts — response interceptor: non-401 errors pass through', () => {
  beforeEach(() => {
    tokenStore.clear()
    // Keep refresh handler alive so we can assert it's NOT called
  })

  it('rejects 403 without calling the refresh endpoint', async () => {
    let refreshHits = 0
    server.use(
      http.get(TEST_URL,     () => err403()),
      http.post(REFRESH_URL, () => { refreshHits++; return HttpResponse.json(REFRESH_RESPONSE) }),
    )

    await expect(api.get('/api/test-resource')).rejects.toMatchObject({
      response: { status: 403 },
    })
    expect(refreshHits).toBe(0)
  })

  it('rejects 500 without calling the refresh endpoint', async () => {
    let refreshHits = 0
    server.use(
      http.get(TEST_URL,     () => err500()),
      http.post(REFRESH_URL, () => { refreshHits++; return HttpResponse.json(REFRESH_RESPONSE) }),
    )

    await expect(api.get('/api/test-resource')).rejects.toMatchObject({
      response: { status: 500 },
    })
    expect(refreshHits).toBe(0)
  })
})
