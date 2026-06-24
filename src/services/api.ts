import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import router from '@/router/router'
import { ADMIN_API_URL, OIDC_ISSUER } from '@/utils/secureConfig'
import { refreshAccessToken } from '@/services/oauth'
import {
  requireElevation,
  flagPasswordChangeRequired,
  challengeCode,
} from '@/services/adminGuards'
import { deverror, devwarn } from '@/utils/devlog'

// ─── In-memory token store (F-01) ────────────────────────────────────────────
// The access token lives only in this module-level variable.
// It is NEVER written to localStorage, sessionStorage, or any other
// persistent browser storage.  Losing it on page-reload is intentional;
// the session is re-established via the HttpOnly refresh-token cookie
// (Authorization Code + PKCE — see services/oauth.ts).
let _accessToken: string | null = null

export const tokenStore = {
  get():            string | null { return _accessToken },
  set(t: string):   void          { _accessToken = t },
  clear():          void          { _accessToken = null },
}

// ─── Axios instances ──────────────────────────────────────────────────────────
// `api` → the admin RESOURCE server (/api/admin/* on :8081). Bearer only; the
//   refresh cookie is scoped to the issuer's /oauth/token path and is never sent
//   here, so credentials are not needed.
const api: AxiosInstance = axios.create({
  baseURL:         ADMIN_API_URL,
  timeout:         30_000,
  withCredentials: false,
  headers: {
    'Content-Type':   'application/json',
    'X-Requested-By': 'oauth2-admin', // lightweight CSRF mitigation (F-16)
  },
})

// `issuerApi` → the OIDC ISSUER / public API (:8080): logout, profile
//   self-service and password reset. Carries credentials so the HttpOnly cookie
//   rides along (logout clears it). No silent-refresh/elevation dance — those
//   only apply to the admin resource server.
export const issuerApi: AxiosInstance = axios.create({
  baseURL:         OIDC_ISSUER,
  timeout:         30_000,
  withCredentials: true,
  headers: {
    'Content-Type':   'application/json',
    'X-Requested-By': 'oauth2-admin',
  },
})

// ─── Token refresh queue ──────────────────────────────────────────────────────
let isRefreshing = false
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = []

const processQueue = (err: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => (err ? reject(err) : resolve(token!)))
  failedQueue = []
}

// ─── Request interceptor — attach bearer token (both instances) ───────────────
function attachBearer(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const token = tokenStore.get()
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}

api.interceptors.request.use(attachBearer, (err) => Promise.reject(err))
issuerApi.interceptors.request.use(attachBearer, (err) => Promise.reject(err))

// ─── Response interceptor — refresh on 401, gate console output ───────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean; _elevated?: boolean }

    // ── 401 Unauthorized → attempt silent refresh via HttpOnly cookie ──────────
    //
    // The token/refresh endpoints return 401 for a genuinely invalid/expired
    // refresh session, and /api/admin/elevate returns 401 for `mfa_required` /
    // wrong code — NOT for an expired access token. Re-running the refresh dance
    // on them would mask the original error and could loop, so they are excluded.
    // (The token/refresh calls also use a bare axios instance in
    // services/oauth.ts, so they never reach this interceptor anyway.)
    const isAuthFlowEndpoint = /\/(oauth\/token|auth\/refresh|admin\/(elevate|change-password))/.test(original.url ?? '')

    if (error.response?.status === 401 && !original._retry && !isAuthFlowEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          if (original.headers) original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }

      original._retry = true
      isRefreshing = true

      try {
        // Single source of truth for the refresh contract (services/oauth.ts).
        // The refresh-token cookie is sent automatically by the browser.
        const accessToken = await refreshAccessToken()

        tokenStore.set(accessToken)
        processQueue(null, accessToken)

        if (original.headers) original.headers.Authorization = `Bearer ${accessToken}`
        return api(original)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        tokenStore.clear()
        router.push({ name: 'Login' })
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    // ── 403 step-up required → prompt for re-auth, then retry once ─────────────
    // (ADMIN-SPA-MIGRATION.md §5). requireElevation() resolves once a fresh
    // elevated token is in tokenStore; we replay the original request with it.
    const challenge = error.response?.status === 403 ? challengeCode(error) : undefined

    if (challenge === 'elevation_required' && !original._elevated) {
      original._elevated = true
      try {
        await requireElevation()
        if (original.headers) original.headers.Authorization = `Bearer ${tokenStore.get()}`
        return api(original)
      } catch {
        // Admin dismissed the prompt — surface the original 403.
        return Promise.reject(error)
      }
    }

    // ── 403 forced password change → flag it; the router guard + global watcher
    //    route the admin to the change-password page (ADMIN-SPA-MIGRATION.md §6).
    if (challenge === 'password_change_required') {
      flagPasswordChangeRequired()
      return Promise.reject(error)
    }

    // ── 403 Forbidden — log only in dev (F-10) ─────────────────────────────────
    if (error.response?.status === 403) {
      devwarn('403 Forbidden on', original.url)
    }

    // ── 5xx Server errors — log only in dev (F-10) ────────────────────────────
    if (error.response?.status && error.response.status >= 500) {
      deverror('Server error on', original.url, error.response.status)
    }

    return Promise.reject(error)
  },
)

export default api

// ─── Helper ───────────────────────────────────────────────────────────────────
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.message) return error.response.data.message as string
    if (error.response?.data?.error)   return error.response.data.error as string
    if (error.message)                 return error.message
  }
  return 'An unexpected error occurred'
}
