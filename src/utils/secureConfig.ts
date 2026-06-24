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
