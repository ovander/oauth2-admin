/**
 * Unit tests for src/security/csp.ts — the canonical security-header policy.
 *
 * These assertions are the deploy GATE (F-02): the strict production CSP must
 * stay deny-by-default with no script escape hatches, and Trusted Types must be
 * present in the Report-Only rollout policy, which reports to the BFF.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  productionCsp,
  productionCspReportOnly,
  devCsp,
  SECURITY_HEADERS,
  TRUSTED_TYPES_POLICIES,
  CSP_REPORT_PATH,
  CSP_REPORT_GROUP,
  REPORTING_ENDPOINTS,
  originOf,
} from '@/security/csp'
import { DEFAULT_POLICY_NAME } from '@/security/trustedTypes'

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

  it('names no reporting endpoint (only the Trusted Types rollout reports, for now)', () => {
    expect(directive(csp, 'report-uri')).toBeUndefined()
    expect(directive(csp, 'report-to')).toBeUndefined()
  })
})

describe('productionCspReportOnly() — Trusted Types rollout', () => {
  const ro = productionCspReportOnly('https://api.example.com')

  it('adds Trusted Types enforcement directives', () => {
    expect(ro).toContain("require-trusted-types-for 'script'")
  })

  it("allows exactly Vue's `vue` policy and the app's own `default` policy", () => {
    // `trusted-types default` alone refused Vue's policy, so every page reported
    // a violation and, enforced, Vue's static-content innerHTML threw.
    expect(directive(ro, 'trusted-types')).toBe('trusted-types vue default')
    expect(TRUSTED_TYPES_POLICIES).toEqual(['vue', 'default'])
    expect(TRUSTED_TYPES_POLICIES).toContain(DEFAULT_POLICY_NAME)
  })

  it('never allows duplicate or wildcard policy names', () => {
    expect(ro).not.toContain("'allow-duplicates'")
    expect(directive(ro, 'trusted-types')).not.toMatch(/\*|'none'/)
  })

  it('still carries the strict resource directives', () => {
    expect(ro).toContain("default-src 'none'")
    expect(ro).toContain("frame-ancestors 'none'")
  })

  it("reports to the BFF's /bff/csp-report by report-uri and by report-to", () => {
    expect(CSP_REPORT_PATH).toBe('/bff/csp-report')
    expect(directive(ro, 'report-uri')).toBe('report-uri /bff/csp-report')
    expect(directive(ro, 'report-to')).toBe(`report-to ${CSP_REPORT_GROUP}`)
    expect(ro.endsWith('; report-uri /bff/csp-report; report-to csp')).toBe(true)
  })
})

describe('REPORTING_ENDPOINTS', () => {
  it('defines the report-to group as the same-origin BFF endpoint', () => {
    expect(REPORTING_ENDPOINTS).toBe('csp="/bff/csp-report"')
    expect(REPORTING_ENDPOINTS).toBe(`${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`)
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

// deploy/Caddyfile is the deployed edge: it must serve the canonical policy
// verbatim, not a relaxed copy (CLAUDE.md: csp.ts and deploy/ change together).
describe('deploy/Caddyfile mirrors csp.ts', () => {
  const caddyfile = readFileSync(resolve(process.cwd(), 'deploy/Caddyfile'), 'utf-8')

  /** The site's `header { … }` block. */
  const headerBlock = caddyfile.match(/\n\theader \{\n([\s\S]*?)\n\t\}/)?.[1] ?? ''

  /**
   * Value of a `Name "value"` or ``Name `value` `` line (Caddy's two quoting
   * forms) in the site's header block, or undefined.
   */
  function caddyHeader(name: string): string | undefined {
    for (const raw of headerBlock.split('\n')) {
      const line = raw.trim()
      if (!line.startsWith(`${name} `)) continue
      const token = line.slice(name.length + 1)
      const quote = token[0]
      if ((quote === '"' || quote === '`') && token.length > 1 && token.endsWith(quote)) {
        return token.slice(1, -1)
      }
    }
    return undefined
  }

  it('sends productionCsp() exactly (same-origin BFF: no API origin)', () => {
    expect(caddyHeader('Content-Security-Policy')).toBe(productionCsp())
  })

  it.each(Object.entries(SECURITY_HEADERS))('sends %s: %s', (name, value) => {
    expect(caddyHeader(name)).toBe(value)
  })

  it('sends the Trusted Types rollout policy as Report-Only, exactly productionCspReportOnly()', () => {
    // docs/security-headers.md, "Trusted Types, staged": the header reports to
    // the BFF's /bff/csp-report and blocks nothing.
    expect(caddyHeader('Content-Security-Policy-Report-Only')).toBe(productionCspReportOnly())
  })

  it('sends Reporting-Endpoints, exactly REPORTING_ENDPOINTS, for the report-to group', () => {
    expect(caddyHeader('Reporting-Endpoints')).toBe(REPORTING_ENDPOINTS)
  })

  it('routes /bff/* (so POST /bff/csp-report) to the admin BFF', () => {
    const matcher = caddyfile.split('\n').map(l => l.trim()).find(l => l.startsWith('@bff path '))
    expect(matcher?.split(' ')).toContain('/bff/*')
    expect(caddyfile).toMatch(/handle @bff \{\n\t\treverse_proxy 127\.0\.0\.1:8091 /)
  })
})
