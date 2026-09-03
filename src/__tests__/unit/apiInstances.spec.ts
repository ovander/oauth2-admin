/**
 * Unit tests for the two axios instances in src/services/api.ts.
 *
 * Under the BFF model the SPA is a same-origin cookie client:
 *   • `api`       → admin API via the BFF (same-origin), carries the session
 *                   cookie (withCredentials). No bearer is ever set in the
 *                   browser — the BFF injects it server-side.
 *   • there is NO second instance: the public issuer flows the SPA needs are
 *     allowlisted by the BFF on the same origin (P3-23).
 */
import { describe, it, expect } from 'vitest'
import api from '@/services/api'
import * as apiModule from '@/services/api'
import { ADMIN_API_URL } from '@/utils/secureConfig'

describe('api instances — BFF cookie model', () => {
  it('`api` targets the admin API (same-origin) and carries the session cookie', () => {
    expect(api.defaults.baseURL).toBe(ADMIN_API_URL)
    expect(api.defaults.withCredentials).toBe(true)
  })

  it('`api` sets no Authorization header (the BFF injects the bearer)', () => {
    const headers = JSON.stringify(api.defaults.headers)
    expect(headers).not.toContain('Authorization')
  })

  it('exports no cross-origin issuer instance (P3-23: everything is same-origin via the BFF)', () => {
    expect('issuerApi' in apiModule).toBe(false)
  })
})
