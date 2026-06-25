/**
 * Runtime origin configuration for the admin console.
 *
 * Under the Backend-for-Frontend (BFF) model the SPA talks to its OWN origin:
 * the BFF (reverse-proxied at `/api/admin/*` and `/bff/*`) injects the bearer
 * server-side and the browser only ever holds an HttpOnly session cookie. So
 * the admin API base defaults to "" (same-origin) and no token is configured
 * in the browser at all.
 *
 * `VITE_ADMIN_API_URL` may still be set to an absolute origin for split-origin
 * setups; when present it must use HTTPS in production (F-07).
 */
function buildApiUrl(): string {
  const url = import.meta.env.VITE_ADMIN_API_URL?.trim()

  // Same-origin (BFF) is the default — the SPA calls relative `/api/admin/*`.
  if (!url) return ''

  if (import.meta.env.PROD && !url.startsWith('https://')) {
    throw new Error(
      `[CONFIG] VITE_ADMIN_API_URL must use HTTPS in production. Got: ${url}`,
    )
  }

  // Strip trailing slash for consistency
  return url.replace(/\/+$/, '')
}

export const ADMIN_API_URL: string = buildApiUrl()

/**
 * Public OIDC issuer origin. Under the BFF model the SPA no longer drives the
 * OAuth flow itself, so this is used ONLY for the public, pre-auth issuer flows
 * that are NOT proxied by the BFF (forgot/reset password). Defaults to ""
 * (same-origin / dev proxy). Must be HTTPS in production when set.
 */
function buildIssuer(): string {
  const url = import.meta.env.VITE_OIDC_ISSUER?.trim()
  if (!url) return '' // same-origin / dev proxy

  if (import.meta.env.PROD && !url.startsWith('https://')) {
    throw new Error(`[CONFIG] VITE_OIDC_ISSUER must use HTTPS in production. Got: ${url}`)
  }
  return url.replace(/\/+$/, '')
}

export const OIDC_ISSUER: string = buildIssuer()
