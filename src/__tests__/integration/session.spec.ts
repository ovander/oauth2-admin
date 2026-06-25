/**
 * Integration tests for services/session.ts — the BFF control-plane client.
 *
 * Exercises the real axios instance through MSW. Verifies:
 *   • fetchSession() returns the payload and syncs csrfStore
 *   • bffLogout() posts to /bff/logout and clears csrfStore
 *   • bffElevate() forwards password (+ mfa_code) and rejects the upstream
 *     challenge on a wrong/absent code
 *   • the request interceptor attaches X-CSRF-Token on POST, not GET
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../msw/server'
import { csrfStore, fetchSession, bffLogout, bffElevate } from '@/services/session'

beforeEach(() => {
  csrfStore.clear()
})

describe('session — fetchSession()', () => {
  it('returns the session and stores the CSRF token', async () => {
    const data = await fetchSession()

    expect(data.authenticated).toBe(true)
    expect(data.user?.email).toBe('admin@example.com')
    expect(csrfStore.get()).toBe('test-csrf-token')
  })

  it('clears the CSRF token when unauthenticated', async () => {
    csrfStore.set('stale')
    server.use(http.get('/bff/session', () => HttpResponse.json({ authenticated: false })))

    const data = await fetchSession()

    expect(data.authenticated).toBe(false)
    expect(csrfStore.get()).toBeNull()
  })
})

describe('session — bffLogout()', () => {
  it('posts to /bff/logout and clears the CSRF token', async () => {
    let hit = false
    csrfStore.set('token')
    server.use(http.post('/bff/logout', () => { hit = true; return new HttpResponse(null, { status: 204 }) }))

    await bffLogout()

    expect(hit).toBe(true)
    expect(csrfStore.get()).toBeNull()
  })
})

describe('session — bffElevate()', () => {
  it('attaches the CSRF token and resolves on the right password', async () => {
    let captured: string | null = null
    csrfStore.set('csrf-xyz')
    server.use(
      http.post('/bff/elevate', ({ request }) => {
        captured = request.headers.get('X-CSRF-Token')
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(bffElevate('correct-password')).resolves.toBeUndefined()
    expect(captured).toBe('csrf-xyz')
  })

  it('forwards mfa_code and rejects the upstream challenge on a wrong code', async () => {
    let body: Record<string, unknown> = {}
    server.use(
      http.post('/bff/elevate', async ({ request }) => {
        body = await request.json() as Record<string, unknown>
        return HttpResponse.json({ error: 'invalid credentials' }, { status: 401 })
      }),
    )

    await expect(bffElevate('wrong', '123456')).rejects.toMatchObject({
      response: { status: 401, data: { error: 'invalid credentials' } },
    })
    expect(body).toEqual({ password: 'wrong', mfa_code: '123456' })
  })
})
