import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import router from '@/router/router'
import { ADMIN_API_URL } from '@/utils/secureConfig'
import { csrfStore, notifySessionExpired } from '@/services/session'
import {
  requireElevation,
  flagPasswordChangeRequired,
  challengeCode,
} from '@/services/adminGuards'
import { deverror, devwarn } from '@/utils/devlog'

// ─── Axios instances ──────────────────────────────────────────────────────────
// `api` → the admin API, reached SAME-ORIGIN through the BFF (/api/admin/*).
//   The browser holds only the HttpOnly session cookie; the BFF injects the
//   bearer server-side, so NO Authorization header is ever set here. We send
//   the cookie (withCredentials) and a CSRF token on state-changing requests.
const api: AxiosInstance = axios.create({
  baseURL:         ADMIN_API_URL, // "" → same-origin (BFF)
  timeout:         30_000,
  withCredentials: true,
  headers: {
    'Content-Type':   'application/json',
    // Custom header → forwarded by the BFF to the upstream admin server, whose
    // CSRF mitigation requires it. Cannot be set cross-origin without a
    // preflight, so it doubles as a same-origin marker.
    'X-Requested-By': 'oauth2-admin',
  },
})

// P3-23: there is no second, cross-origin instance any more. The public issuer
// flows the SPA needs (forgot/reset password, /api/version) are allowlisted by
// the BFF on this origin, so `api` is the only instance.

// ─── Request interceptor — attach the CSRF token on unsafe methods ────────────
function isUnsafe(method?: string): boolean {
  const m = (method ?? 'get').toUpperCase()
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS'
}

api.interceptors.request.use(
  (config) => {
    if (isUnsafe(config.method)) {
      const token = csrfStore.get()
      if (token && config.headers) config.headers['X-CSRF-Token'] = token
    }
    return config
  },
  (err) => Promise.reject(err),
)

// ─── Response interceptor — session expiry, step-up, forced change ────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _elevated?: boolean }
    const status = error.response?.status

    // ── 401 → the BFF session is gone. The BFF already attempts a silent token
    //    refresh server-side, so a 401 here means re-auth is genuinely required:
    //    send the user to login. EXCEPTION: change-password returns 401 for a
    //    wrong *current* password — a form error, not session expiry — so let it
    //    fall through to the caller instead of bouncing to Login.
    const isAuthFormEndpoint = /\/admin\/change-password/.test(original.url ?? '')

    if (status === 401 && !isAuthFormEndpoint) {
      csrfStore.clear()
      // P3-22: drop the cached user too, otherwise the router guard still
      // believes we are authenticated and the app loops between the 401 and
      // the Login route after a BFF restart.
      notifySessionExpired()
      router.push({ name: 'Login' })
      return Promise.reject(error)
    }

    // ── 403 step-up required → re-auth through the BFF, then retry once.
    //    requireElevation() resolves once /bff/elevate has elevated the session;
    //    the replayed request is served with the elevated token automatically.
    const challenge = status === 403 ? challengeCode(error) : undefined

    if (challenge === 'elevation_required' && !original._elevated) {
      original._elevated = true
      try {
        await requireElevation()
        return api(original)
      } catch {
        // Admin dismissed the prompt — surface the original 403.
        return Promise.reject(error)
      }
    }

    // ── 403 forced password change → flag it; the router guard + global watcher
    //    route the admin to the change-password page.
    if (challenge === 'password_change_required') {
      flagPasswordChangeRequired()
      return Promise.reject(error)
    }

    // ── 403 Forbidden — log only in dev (F-10) ─────────────────────────────────
    if (status === 403) {
      devwarn('403 Forbidden on', original.url)
    }

    // ── 5xx Server errors — log only in dev (F-10) ────────────────────────────
    if (status && status >= 500) {
      deverror('Server error on', original.url, status)
    }

    return Promise.reject(error)
  },
)

export default api

// ─── Helper ───────────────────────────────────────────────────────────────────
// Refusals from Socrate's access policy (A4) carry a machine code, not a
// sentence. Translate the ones an admin can act on; any other code is shown
// as-is, as before.
const POLICY_ERROR_MESSAGES: Record<string, string> = {
  policy_denied:      'This action is not allowed by the access policy.',
  mfa_required:       'The access policy requires a session signed in with multi-factor authentication for this action.',
  policy_unavailable: 'The access policy is unavailable right now. Try again shortly.',
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.message) return error.response.data.message as string
    const code = error.response?.data?.error as string | undefined
    if (code && POLICY_ERROR_MESSAGES[code]) return POLICY_ERROR_MESSAGES[code]
    if (code) return code
    if (error.message)                 return error.message
  }
  return 'An unexpected error occurred'
}
