/**
 * Canonical security headers for the Socrate admin console (F-02).
 *
 * Single source of truth consumed by vite.config.ts (dev + preview servers) and
 * the header tests. The PRODUCTION CSP is delivered by the reverse proxy — derive
 * the Nginx/Caddy config from productionCsp() + SECURITY_HEADERS (see
 * docs/security-headers.md), and keep this module as the authority both sides
 * are tested against.
 *
 * The production build emits a single external module script and no inline
 * scripts, so `script-src 'self'` (no 'unsafe-inline'/'unsafe-eval') holds.
 * `style-src` keeps 'unsafe-inline' because PrimeVue/Tailwind inject <style> at
 * runtime.
 */

type Directives = Record<string, string[]>

function serialize(directives: Directives): string {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

/** Strict resource directives. `apiOrigin` is added to connect-src when given. */
function strictDirectives(apiOrigin?: string): Directives {
  return {
    'default-src':     ["'none'"],
    'script-src':      ["'self'"],
    'style-src':       ["'self'", "'unsafe-inline'"], // PrimeVue/Tailwind runtime <style>
    'img-src':         ["'self'", 'data:'],
    'font-src':        ["'self'"],
    'connect-src':     ["'self'", ...(apiOrigin ? [apiOrigin] : [])],
    'base-uri':        ["'self'"],
    'form-action':     ["'self'"],
    'frame-ancestors': ["'none'"],
    'object-src':      ["'none'"],
  }
}

/**
 * Strict, enforceable production CSP. Serve as the `Content-Security-Policy`
 * response header at the reverse proxy.
 */
export function productionCsp(apiOrigin?: string): string {
  return serialize(strictDirectives(apiOrigin))
}

/**
 * Trusted Types policy names the built app may create, nothing more:
 * - `vue`: created by Vue's runtime-dom for compiled static template content.
 *   It does not sanitise, and v-html / innerHTML props would also go through it:
 *   the ESLint gate that bans them is what keeps that path closed.
 * - `default`: created by the app itself (src/security/trustedTypes.ts). It
 *   rejects every value except the empty string, which PrimeVue's Tooltip
 *   assigns to `innerHTML`; it is never a pass-through.
 * No `'allow-duplicates'`: each name can be created once, and main.ts claims
 * `default` at start-up.
 */
export const TRUSTED_TYPES_POLICIES: readonly string[] = ['vue', 'default']

/**
 * Where violation reports go: the admin BFF's `POST /bff/csp-report`, which
 * only logs them (no session, no CSRF token: browsers send reports without
 * either). Same origin, so Caddy's `/bff/*` route already reaches it.
 */
export const CSP_REPORT_PATH = '/bff/csp-report'

/** Reporting API endpoint group named by `report-to`. */
export const CSP_REPORT_GROUP = 'csp'

/**
 * Value of the `Reporting-Endpoints` response header that defines the
 * `report-to` group: `csp="/bff/csp-report"`. Send it next to the policy that
 * names the group.
 */
export const REPORTING_ENDPOINTS = `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`

/**
 * Production CSP + Trusted Types, for the staged rollout. Serve as
 * `Content-Security-Policy-Report-Only` first so `require-trusted-types-for`
 * violations are reported without breaking the app; once staging is clean, fold
 * the Trusted Types directives into the enforced header.
 *
 * Reports go to the BFF by both mechanisms: `report-to` (Reporting API, with
 * the `Reporting-Endpoints` header above), and `report-uri` for browsers that
 * do not support it. A browser that supports `report-to` ignores `report-uri`.
 * The enforced productionCsp() names no endpoint (docs/security-headers.md).
 */
export function productionCspReportOnly(apiOrigin?: string): string {
  const directives = strictDirectives(apiOrigin)
  directives['require-trusted-types-for'] = ["'script'"]
  directives['trusted-types'] = [...TRUSTED_TYPES_POLICIES]
  directives['report-uri'] = [CSP_REPORT_PATH]
  directives['report-to'] = [CSP_REPORT_GROUP]
  return serialize(directives)
}

/** Dev-server CSP — HMR needs eval + inline + the Vite websocket. */
export function devCsp(): string {
  return serialize({
    'default-src':     ["'self'"],
    'script-src':      ["'self'", "'unsafe-eval'", "'unsafe-inline'"],
    'style-src':       ["'self'", "'unsafe-inline'"],
    'connect-src':     ["'self'", 'ws://localhost:5173', 'ws://localhost:5174', 'http://localhost:8080', 'http://localhost:8081'],
    'img-src':         ["'self'", 'data:', 'blob:'],
    'font-src':        ["'self'"],
    'base-uri':        ["'self'"],
    'form-action':     ["'self'"],
    'frame-ancestors': ["'none'"],
    'object-src':      ["'none'"],
  })
}

/** Non-CSP hardening headers the proxy (and the dev/preview servers) must send. */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options':            'DENY',
  'X-Content-Type-Options':     'nosniff',
  'Referrer-Policy':            'strict-origin-when-cross-origin',
  'Permissions-Policy':         'geolocation=(), microphone=(), camera=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

/** Origin (scheme://host[:port]) of a full URL, for connect-src. Undefined if unparseable. */
export function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}
