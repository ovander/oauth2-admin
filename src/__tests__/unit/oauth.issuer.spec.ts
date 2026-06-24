/**
 * Unit tests for the OIDC issuer decoupling in src/services/oauth.ts.
 *
 * authorize/token/refresh must target VITE_OIDC_ISSUER (the authorization
 * server origin) independently of VITE_ADMIN_API_URL (the admin API origin) —
 * they are different origins in split-port deployments (OAuth :8080, admin
 * :8081). Endpoints are module-level constants, so each case resets modules and
 * stubs env before a dynamic import.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('oauth — issuer configuration', () => {
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { vi.unstubAllEnvs() })

  it('targets VITE_OIDC_ISSUER for authorize/token/refresh, decoupled from the admin API', async () => {
    vi.stubEnv('VITE_ADMIN_API_URL', 'http://localhost:5173')
    vi.stubEnv('VITE_OIDC_ISSUER', 'http://localhost:8080')

    const oauth = await import('@/services/oauth')

    expect(oauth.AUTHORIZE_ENDPOINT).toBe('http://localhost:8080/oauth/authorize')
    expect(oauth.TOKEN_ENDPOINT).toBe('http://localhost:8080/oauth/token')
    expect(oauth.REFRESH_ENDPOINT).toBe('http://localhost:8080/oauth/token')
  })

  it('falls back to the admin API origin when VITE_OIDC_ISSUER is unset', async () => {
    vi.stubEnv('VITE_ADMIN_API_URL', 'https://gateway.example.com')

    const oauth = await import('@/services/oauth')

    expect(oauth.AUTHORIZE_ENDPOINT).toBe('https://gateway.example.com/oauth/authorize')
    expect(oauth.TOKEN_ENDPOINT).toBe('https://gateway.example.com/oauth/token')
  })

  it('strips a trailing slash from the issuer origin', async () => {
    vi.stubEnv('VITE_ADMIN_API_URL', 'http://localhost:5173')
    vi.stubEnv('VITE_OIDC_ISSUER', 'http://localhost:8080/')

    const oauth = await import('@/services/oauth')

    expect(oauth.AUTHORIZE_ENDPOINT).toBe('http://localhost:8080/oauth/authorize')
  })
})
