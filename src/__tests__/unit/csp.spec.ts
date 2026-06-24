/**
 * Unit tests for src/security/csp.ts — the canonical security-header policy.
 *
 * These assertions are the deploy GATE (F-02): the strict production CSP must
 * stay deny-by-default with no script escape hatches, and Trusted Types must be
 * present in the Report-Only rollout policy.
 */
import { describe, it, expect } from 'vitest'
import {
  productionCsp,
  productionCspReportOnly,
  devCsp,
  SECURITY_HEADERS,
  originOf,
} from '@/security/csp'

/** Pull a single directive (e.g. "script-src 'self'") out of a CSP string. */
function directive(csp: string, name: string): string | undefined {
  return csp.split('; ').find(d => d === name || d.startsWith(`${name} `))
}

describe('productionCsp()', () => {
  const csp = productionCsp('https://api.example.com')

  it('is deny-by-default', () => {
    expect(csp).toContain("default-src 'none'")
  })

  it('locks scripts to self with NO unsafe-inline / unsafe-eval', () => {
    // script-src must be EXACTLY 'self' — no escape hatches. ('unsafe-inline'
    // is allowed elsewhere, e.g. style-src, so assert the directive precisely.)
    expect(directive(csp, 'script-src')).toBe("script-src 'self'")
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it('blocks framing, plugins, base-tag hijack and form exfiltration', () => {
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
  })

  it('allows the API origin (and self) in connect-src', () => {
    expect(csp).toContain("connect-src 'self' https://api.example.com")
  })

  it('omits the API origin from connect-src when same-origin (none provided)', () => {
    expect(productionCsp()).toContain("connect-src 'self';")
  })

  it('keeps style-src unsafe-inline for PrimeVue/Tailwind runtime styles', () => {
    // Note: 'unsafe-inline' is permitted ONLY under style-src, never script-src.
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline'/)
  })
})

describe('productionCspReportOnly() — Trusted Types rollout', () => {
  const ro = productionCspReportOnly('https://api.example.com')

  it('adds Trusted Types enforcement directives', () => {
    expect(ro).toContain("require-trusted-types-for 'script'")
    expect(ro).toContain('trusted-types default')
  })

  it('still carries the strict resource directives', () => {
    expect(ro).toContain("default-src 'none'")
    expect(ro).toContain("frame-ancestors 'none'")
  })
})

describe('devCsp()', () => {
  it('permits the Vite HMR runtime (eval + inline + ws) but keeps framing/plugin locks', () => {
    const dev = devCsp()
    expect(dev).toContain("'unsafe-eval'")
    expect(dev).toContain('ws://localhost:5173')
    expect(dev).toContain("frame-ancestors 'none'")
    expect(dev).toContain("object-src 'none'")
  })
})

describe('SECURITY_HEADERS', () => {
  it('denies framing and sniffing, and tightens referrer/permissions/opener', () => {
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY')
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff')
    expect(SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(SECURITY_HEADERS['Permissions-Policy']).toContain('camera=()')
    expect(SECURITY_HEADERS['Cross-Origin-Opener-Policy']).toBe('same-origin')
  })
})

describe('originOf()', () => {
  it('extracts the origin from a full URL', () => {
    expect(originOf('https://api.example.com/v1/')).toBe('https://api.example.com')
  })
  it('returns undefined for empty or unparseable input', () => {
    expect(originOf(undefined)).toBeUndefined()
    expect(originOf('not a url')).toBeUndefined()
  })
})
