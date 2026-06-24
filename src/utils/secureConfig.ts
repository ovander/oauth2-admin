/**
 * Reads VITE_ADMIN_API_URL and asserts it is present and uses HTTPS in
 * production.  Throws at module-load time so the app cannot start in a
 * misconfigured state (F-07).
 */
function buildApiUrl(): string {
  const url = import.meta.env.VITE_ADMIN_API_URL

  if (!url || url.trim() === '') {
    throw new Error(
      '[CONFIG] VITE_ADMIN_API_URL is required but not set. ' +
      'Set it to your admin API origin (e.g. https://admin-api.example.com).'
    )
  }

  if (import.meta.env.PROD && !url.startsWith('https://')) {
    throw new Error(
      `[CONFIG] VITE_ADMIN_API_URL must use HTTPS in production. ` +
      `Got: ${url}`
    )
  }

  // Strip trailing slash for consistency
  return url.replace(/\/$/, '')
}

export const ADMIN_API_URL: string = buildApiUrl()

/**
 * The OIDC issuer origin (authorization server): authorize, token, refresh and
 * logout live here. In split-port deployments this is a DIFFERENT origin from
 * the admin API (OAuth on :8080, admin on :8081). Defaults to the admin API
 * origin for single-origin / reverse-proxy setups. Must be HTTPS in production.
 */
function buildIssuer(): string {
  const url = import.meta.env.VITE_OIDC_ISSUER?.trim()
  if (!url) return ADMIN_API_URL // single-origin / gateway default

  if (import.meta.env.PROD && !url.startsWith('https://')) {
    throw new Error(`[CONFIG] VITE_OIDC_ISSUER must use HTTPS in production. Got: ${url}`)
  }
  return url.replace(/\/+$/, '')
}

export const OIDC_ISSUER: string = buildIssuer()
