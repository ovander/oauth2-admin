import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import router from '@/router/router'
import { ADMIN_API_URL } from '@/utils/secureConfig'
import { refreshAccessToken } from '@/services/oauth'
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

// ─── Axios instance ───────────────────────────────────────────────────────────
const api: AxiosInstance = axios.create({
  baseURL:         ADMIN_API_URL,
  timeout:         30_000,
  withCredentials: true,           // required so the browser sends the HttpOnly refresh-token cookie
  headers: {
    'Content-Type':   'application/json',
    'X-Requested-By': 'oauth2-admin', // lightweight CSRF mitigation (F-16)
  },
})

// ─── Token refresh queue ──────────────────────────────────────────────────────
let isRefreshing = false
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = []

const processQueue = (err: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => (err ? reject(err) : resolve(token!)))
  failedQueue = []
}

// ─── Request interceptor — attach bearer token ────────────────────────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStore.get()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (err) => Promise.reject(err),
)

// ─── Response interceptor — refresh on 401, gate console output ───────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // ── 401 Unauthorized → attempt silent refresh via HttpOnly cookie ──────────
    //
    // The token exchange and refresh endpoints return 401 for a genuinely
    // invalid/expired refresh session — NOT for an expired access token.
    // Re-running the refresh dance on them would mask the original error and
    // could loop, so they are excluded. (They also use a bare axios instance in
    // services/oauth.ts, so they never reach this interceptor — this guard is
    // belt-and-braces.)
    const isAuthFlowEndpoint = /\/(oauth\/token|auth\/refresh)/.test(original.url ?? '')

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
