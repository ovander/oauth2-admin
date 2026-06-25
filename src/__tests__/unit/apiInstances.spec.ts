/**
 * Unit tests for the two axios instances in src/services/api.ts.
 *
 * Under the BFF model the SPA is a same-origin cookie client:
 *   • `api`       → admin API via the BFF (same-origin), carries the session
 *                   cookie (withCredentials). No bearer is ever set in the
 *                   browser — the BFF injects it server-side.
 *   • `issuerApi` → public, pre-auth issuer flows the BFF does not proxy
 *                   (forgot/reset password). No credentials.
 */
import { describe, it, expect } from 'vitest'
import api, { issuerApi } from '@/services/api'
import { ADMIN_API_URL, OIDC_ISSUER } from '@/utils/secureConfig'

describe('api instances — BFF cookie model', () => {
  it('`api` targets the admin API (same-origin) and carries the session cookie', () => {
    expect(api.defaults.baseURL).toBe(ADMIN_API_URL)
    expect(api.defaults.withCredentials).toBe(true)
  })

  it('`api` sets no Authorization header (the BFF injects the bearer)', () => {
    const headers = JSON.stringify(api.defaults.headers)
    expect(headers).not.toContain('Authorization')
  })

  it('`issuerApi` targets the public issuer for pre-auth flows', () => {
    expect(issuerApi.defaults.baseURL).toBe(OIDC_ISSUER)
  })
})
