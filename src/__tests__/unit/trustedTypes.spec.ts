/**
 * Unit tests for src/security/trustedTypes.ts — the app's Trusted Types
 * `default` policy. It must reject, never pass through: only the empty string
 * (PrimeVue Tooltip's `innerHTML = ''`) is let through.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_POLICY_NAME,
  defaultPolicyCreateHTML,
  defaultPolicyReject,
  installDefaultTrustedTypesPolicy,
  type TrustedTypesFactory,
} from '@/security/trustedTypes'

describe('defaultPolicyCreateHTML()', () => {
  it('lets the empty string through (clearing an element injects nothing)', () => {
    expect(defaultPolicyCreateHTML('')).toBe('')
  })

  it.each([
    ' ',
    'text',
    '<b>bold</b>',
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
  ])('rejects %j', input => {
    expect(defaultPolicyCreateHTML(input)).toBeNull()
  })
})

describe('defaultPolicyReject()', () => {
  it('refuses scripts and script URLs', () => {
    expect(defaultPolicyReject()).toBeNull()
  })
})

describe('installDefaultTrustedTypesPolicy()', () => {
  it('creates the `default` policy with the rejecting rules', () => {
    const createPolicy = vi.fn()
    expect(installDefaultTrustedTypesPolicy({ createPolicy })).toBe(true)
    expect(createPolicy).toHaveBeenCalledOnce()
    expect(createPolicy).toHaveBeenCalledWith(DEFAULT_POLICY_NAME, {
      createHTML:      defaultPolicyCreateHTML,
      createScript:    defaultPolicyReject,
      createScriptURL: defaultPolicyReject,
    })
    expect(DEFAULT_POLICY_NAME).toBe('default')
  })

  it('is a no-op without Trusted Types support', () => {
    expect(installDefaultTrustedTypesPolicy(undefined)).toBe(false)
  })

  it('reads window.trustedTypes by default', () => {
    const createPolicy = vi.fn()
    vi.stubGlobal('trustedTypes', { createPolicy } satisfies TrustedTypesFactory)
    try {
      expect(installDefaultTrustedTypesPolicy()).toBe(true)
      expect(createPolicy).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports false, without throwing, when the CSP or an earlier policy refuses the name', () => {
    const createPolicy = vi.fn(() => {
      throw new TypeError('Policy "default" disallowed.')
    })
    expect(installDefaultTrustedTypesPolicy({ createPolicy })).toBe(false)
  })
})
