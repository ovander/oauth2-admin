import { describe, it, expect } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { getErrorMessage } from '@/services/api'

function axiosErr(data: unknown, message = 'Request failed'): AxiosError {
  return new AxiosError(message, 'ERR_BAD_REQUEST', undefined, undefined, {
    data, status: 403, statusText: 'Forbidden', headers: {}, config: { headers: new AxiosHeaders() },
  })
}

describe('getErrorMessage', () => {
  it('translates the access-policy codes into sentences', () => {
    expect(getErrorMessage(axiosErr({ error: 'policy_denied' }))).toMatch(/not allowed by the access policy/)
    expect(getErrorMessage(axiosErr({ error: 'mfa_required' }))).toMatch(/multi-factor/)
    expect(getErrorMessage(axiosErr({ error: 'policy_unavailable' }))).toMatch(/unavailable/)
  })
  it('keeps other codes and messages as before', () => {
    expect(getErrorMessage(axiosErr({ error: 'forbidden' }))).toBe('forbidden')
    expect(getErrorMessage(axiosErr({ message: 'Human sentence', error: 'policy_denied' }))).toBe('Human sentence')
    expect(getErrorMessage(axiosErr(undefined, 'Network Error'))).toBe('Network Error')
    expect(getErrorMessage(new Error('x'))).toBe('An unexpected error occurred')
  })
})
