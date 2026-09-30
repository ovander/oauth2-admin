import type { App } from '@/types/application'

/**
 * DEFAULT_ADMIN_BASE_URL is where an application on the apps host reaches the
 * loopback-only admin API: the local end of the SSH tunnel to the Socrate host
 * (go-oauth2 deploy/scripts/apps-socrate-tunnel.sh). On the Socrate host itself
 * it is http://127.0.0.1:8082.
 */
export const DEFAULT_ADMIN_BASE_URL = 'http://127.0.0.1:18082'

export interface AppEnvOptions {
  /** Socrate's public issuer URL (GET /api/admin/settings/config → issuer_url). */
  issuer?: string
  /** The client secret, only while the console is showing it (creation, rotation). */
  clientSecret?: string
  adminBaseUrl?: string
}

/**
 * normalizeIssuer returns the issuer origin and path without a trailing slash,
 * or '' when the value is not an absolute http(s) URL.
 */
export function normalizeIssuer(raw: string | undefined): string {
  const value = (raw ?? '').trim()
  if (!value || /\s/.test(value)) return ''
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return ''
    if (u.username || u.password || u.search || u.hash) return ''
    return (u.origin + u.pathname).replace(/\/+$/, '')
  } catch {
    return ''
  }
}

/** oneLine keeps a value on its own line: a name can never add a variable. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

/**
 * buildAppEnv renders the SOCRATE_* variables an application's backend needs
 * (the names backendkit's integration guide uses), ready to paste into the
 * application's server-side .env. Comments sit on their own lines, since not
 * every .env parser accepts a trailing comment. The client secret is filled in
 * only when given; Socrate stores only its hash, so it is otherwise left empty.
 */
export function buildAppEnv(
  app: Pick<App, 'id' | 'name' | 'client_id' | 'is_public'>,
  opts: AppEnvOptions = {},
): string {
  const issuer = normalizeIssuer(opts.issuer)
  const lines = [
    `# Socrate: ${oneLine(app.name)} (app ID ${app.id})`,
    '# Server-side only; keep this file out of version control.',
  ]
  if (!issuer) {
    lines.push('# Fill in Socrate\'s public URL (the issuer), e.g. https://socrate.example.com')
  }
  lines.push(
    `SOCRATE_ISSUER=${issuer}`,
    `SOCRATE_BASE_URL=${issuer}`,
    `SOCRATE_JWKS_URL=${issuer ? issuer + '/.well-known/jwks.json' : ''}`,
    '# Loopback admin API: the SSH tunnel on the apps host, or http://127.0.0.1:8082 on the Socrate host.',
    `SOCRATE_ADMIN_BASE_URL=${oneLine(opts.adminBaseUrl ?? DEFAULT_ADMIN_BASE_URL)}`,
    `SOCRATE_CLIENT_ID=${oneLine(app.client_id)}`,
  )
  if (app.is_public) {
    lines.push('# Public client: no client secret (PKCE on every authorization request).')
  } else {
    const secret = oneLine(opts.clientSecret ?? '')
    if (!secret) {
      lines.push('# Shown once, at creation or rotation. Rotate the secret to get a new one.')
    }
    lines.push(`SOCRATE_CLIENT_SECRET=${secret}`)
  }
  lines.push(`SOCRATE_APP_ID=${app.id}`)
  return lines.join('\n') + '\n'
}
