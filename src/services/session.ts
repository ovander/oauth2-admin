/**
 * Client for the Backend-for-Frontend (BFF) session endpoints (`/bff/*`).
 *
 * In the BFF model the browser is a pure cookie client: it holds only an opaque
 * HttpOnly `__Host-admin_session` cookie. There is NO access token, refresh
 * token, PKCE verifier or OAuth state in JavaScript — the BFF performs the
 * Authorization Code + PKCE flow server-side and injects the bearer onto every
 * `/api/admin/*` call. This module is the small surface the SPA uses to:
 *   • bootstrap auth state          → GET  /bff/session
 *   • start login (full-page nav)   → GET  /bff/login   (via startLogin)
 *   • revoke the session            → POST /bff/logout
 *   • step-up re-authentication     → POST /bff/elevate
 */
import axios, { type AxiosInstance } from 'axios'

// ─── CSRF token store (double-submit) ─────────────────────────────────────────
// Returned by GET /bff/session and echoed back in the X-CSRF-Token header on
// every state-changing request; the BFF compares it constant-time to the value
// bound to the session. Held in memory only — never persisted.
let _csrf: string | null = null

export const csrfStore = {
  get():               string | null { return _csrf },
  set(t: string | null): void        { _csrf = t },
  clear():             void           { _csrf = null },
}

// ─── Session-expired signal (P3-22) ───────────────────────────────────────────
// The `api` 401 interceptor cannot import the auth store (circular: store →
// authService → api), so it raises this signal instead and the store clears its
// cached user. Without it a restarted BFF (all sessions gone) left
// `authStore.user` populated: the router guard saw "authenticated", every call
// bounced 401 → Login → guard → back again, and the admin was stuck.
type SessionExpiredListener = () => void
const sessionExpiredListeners = new Set<SessionExpiredListener>()

/** Register a callback fired when the BFF session is found to be gone. Returns an unsubscribe. */
export function onSessionExpired(fn: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(fn)
  return () => { sessionExpiredListeners.delete(fn) }
}

/** Fire the session-expired listeners (called by the 401 interceptor). */
export function notifySessionExpired(): void {
  for (const fn of sessionExpiredListeners) fn()
}

// ─── Types ──────────────────────────────────────────────────────────────────
export interface BffSessionUser {
  sub:   string
  email: string
  name:  string
  roles: string[]
}

export interface BffSession {
  authenticated: boolean
  user?: BffSessionUser
  csrf?: string
}

// ─── Same-origin BFF client ───────────────────────────────────────────────────
// Deliberately separate from the `api` instance so the control-plane calls are
// never caught by the admin 401/elevation response machinery. Carries the
// session cookie; attaches the CSRF token on unsafe methods.
const bff: AxiosInstance = axios.create({
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

bff.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const token = csrfStore.get()
    if (token && config.headers) config.headers['X-CSRF-Token'] = token
  }
  return config
})

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Bootstrap the session. Returns `{ authenticated, user?, csrf? }` and, as a
 * side effect, keeps {@link csrfStore} in sync with the server's CSRF token.
 */
export async function fetchSession(): Promise<BffSession> {
  const { data } = await bff.get<BffSession>('/bff/session')
  if (data.authenticated && data.csrf) csrfStore.set(data.csrf)
  else csrfStore.clear()
  return data
}

/** Revoke the server-side session and clear the cookie. Best-effort. */
export async function bffLogout(): Promise<void> {
  try {
    await bff.post('/bff/logout')
  } finally {
    csrfStore.clear()
  }
}

/**
 * Server-side step-up (re-authentication). The BFF re-authenticates against the
 * admin API and absorbs the short-lived elevated token into the session —
 * nothing sensitive is returned to the browser. Rejects with the upstream error
 * body (e.g. `{ error: "mfa_required" }`) so the caller can re-prompt.
 */
export async function bffElevate(password: string, mfaCode?: string): Promise<void> {
  await bff.post('/bff/elevate', {
    password,
    ...(mfaCode ? { mfa_code: mfaCode } : {}),
  })
}

/**
 * Begin BFF-driven login via a full-page navigation to `/bff/login`. The BFF
 * redirects to the authorization server, handles the callback, mints the
 * session cookie, and returns the browser to `returnPath` (validated
 * server-side). This function does not return in the happy path.
 */
export function startLogin(returnPath?: string): void {
  const q = returnPath ? `?return_to=${encodeURIComponent(returnPath)}` : ''
  window.location.assign(`/bff/login${q}`)
}
