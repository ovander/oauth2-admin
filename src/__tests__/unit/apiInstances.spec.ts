/**
 * Unit tests for the two axios instances in src/services/api.ts.
 *
 * The admin resource server (:8081) and the OIDC issuer (:8080) are different
 * origins, so the SPA uses two instances. Credentials ride only on the issuer
 * instance (the refresh cookie); the admin instance is Bearer-only.
 */
import { describe, it, expect } from 'vitest'
import api, { issuerApi } from '@/services/api'
import { ADMIN_API_URL, OIDC_ISSUER } from '@/utils/secureConfig'

describe('api instances — origin split', () => {
  it('`api` targets the admin resource server, Bearer-only (no credentials)', () => {
    expect(api.defaults.baseURL).toBe(ADMIN_API_URL)
    expect(api.defaults.withCredentials).toBe(false)
  })

  it('`issuerApi` targets the OIDC issuer and carries credentials (refresh cookie)', () => {
    expect(issuerApi.defaults.baseURL).toBe(OIDC_ISSUER)
    expect(issuerApi.defaults.withCredentials).toBe(true)
  })
})
