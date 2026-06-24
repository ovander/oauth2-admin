/**
 * Integration tests for src/services/oauth.ts — Authorization Code + PKCE.
 *
 * MSW intercepts the token endpoint; window.location.assign is stubbed so the
 * authorize redirect can be inspected without navigating.
 *
 * Security relevance:
 *  F-03 — login is delegated to the AS; the SPA only carries code + verifier
 *  CSRF — completeLogin() MUST reject a `state` that doesn't match the value
 *         stored before the redirect (RFC 6749 §10.12)
 *  The verifier is single-use: cleared from sessionStorage on success AND on
 *  any failure, so it can never be replayed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as oauth from '@/services/oauth'
import { OAuthError } from '@/services/oauth'

const BASE = 'https://api.test.example.com'
const PKCE_KEY = 'socrate.pkce'

function storedState(): string {
  return JSON.parse(sessionStorage.getItem(PKCE_KEY) as string).state
}

/** Run beginLogin with location.assign stubbed; return the captured authorize URL. */
async function startLogin(returnPath?: string): Promise<URL> {
  const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  await oauth.beginLogin(returnPath)
  const captured = assign.mock.calls[0][0] as string
  assign.mockRestore()
  return new URL(captured)
}

describe('oauth — beginLogin()', () => {
  beforeEach(() => { sessionStorage.clear() })

  it('redirects to /oauth/authorize with response_type=code and an S256 challenge', async () => {
    const url = await startLogin('/apps/1')

    expect(`${url.origin}${url.pathname}`).toBe(`${BASE}/oauth/authorize`)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('state')).toBe(storedState())
  })

  it('persists the verifier in sessionStorage but NEVER puts it in the URL', async () => {
    const url = await startLogin()
    const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) as string)
    expect(saved.verifier).toBeTruthy()
    expect(url.toString()).not.toContain(saved.verifier)
  })

  it('remembers the return path for post-login navigation', async () => {
    await startLogin('/security')
    const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) as string)
    expect(saved.redirect).toBe('/security')
  })
})

describe('oauth — completeLogin()', () => {
  beforeEach(() => { sessionStorage.clear() })

  it('exchanges the code + verifier for tokens and returns the access token and path', async () => {
    const state = (await startLogin('/security'), storedState())

    const result = await oauth.completeLogin({ code: 'auth-code', state })

    expect(result.accessToken).toBe('test-access-token')
    expect(result.returnPath).toBe('/security')
    // Single-use: the verifier is gone after a successful exchange.
    expect(sessionStorage.getItem(PKCE_KEY)).toBeNull()
  })

  it('rejects a mismatched state (CSRF / mix-up) and clears the verifier', async () => {
    await startLogin()

    await expect(
      oauth.completeLogin({ code: 'auth-code', state: 'tampered-state' }),
    ).rejects.toBeInstanceOf(OAuthError)
    expect(sessionStorage.getItem(PKCE_KEY)).toBeNull()
  })

  it('surfaces an AS error response (e.g. access_denied)', async () => {
    await startLogin()

    await expect(
      oauth.completeLogin({ error: 'access_denied', error_description: 'user denied access' }),
    ).rejects.toMatchObject({ code: 'access_denied' })
  })

  it('rejects when there is no PKCE login in progress', async () => {
    // sessionStorage is empty — nothing was started.
    await expect(
      oauth.completeLogin({ code: 'x', state: 'y' }),
    ).rejects.toBeInstanceOf(OAuthError)
  })

  it('rejects a malformed response missing the code', async () => {
    const state = (await startLogin(), storedState())
    await expect(
      oauth.completeLogin({ state }),
    ).rejects.toBeInstanceOf(OAuthError)
  })
})

describe('oauth — refreshAccessToken()', () => {
  it('returns the rotated access token from the refresh endpoint', async () => {
    const token = await oauth.refreshAccessToken()
    expect(token).toBe('refreshed-access-token')
  })
})
