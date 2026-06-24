/**
 * OAuth 2.1 Authorization Code + PKCE client for the Socrate admin console.
 *
 * The admin console is a FIRST-PARTY PUBLIC CLIENT: it has no client secret and
 * relies on PKCE (S256) to bind the authorization code to this browser. Login
 * is delegated to the authorization server's hosted login page — the SPA never
 * sees the password or the MFA code.
 *
 * Token handling:
 *   • access_token  — returned in the token response body, held in memory only
 *                     (see tokenStore in api.ts). Never persisted.
 *   • refresh_token — set by the backend as an HttpOnly, Secure, SameSite=Strict
 *                     cookie. It NEVER touches JavaScript, so this module never
 *                     reads or stores it. `withCredentials: true` makes the
 *                     browser carry it on the token/refresh calls.
 *
 * These calls use a bare axios instance (not the shared `api` instance) so the
 * 401-refresh response interceptor can never recurse into the auth flow itself.
 */
import axios from 'axios'
import { ADMIN_API_URL } from '@/utils/secureConfig'
import {
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  generateNonce,
} from './pkce'

// ─── Configuration ────────────────────────────────────────────────────────────
// Public-client id, requested scopes and the registered redirect path. All have
// safe defaults so local/dev and the test runner work without extra env wiring;
// production overrides them via .env (see .env.example).
const CLIENT_ID      = (import.meta.env.VITE_OAUTH_CLIENT_ID    ?? 'oauth2-admin').trim()
const SCOPES         = (import.meta.env.VITE_OAUTH_SCOPES       ?? 'openid email profile').trim()
const REDIRECT_PATH  = (import.meta.env.VITE_OAUTH_REDIRECT_PATH ?? '/auth/callback').trim()

// The OIDC issuer origin (authorization server). The authorize/token/refresh
// endpoints live here — which is a DIFFERENT origin from the admin API when the
// backend runs split-port (OAuth on :8080, admin on :8081). Sending the browser
// straight to the issuer means the hosted login renders from its own origin
// (styled, with its /static assets) and matches the `iss` claim. Defaults to the
// admin API origin for single-origin / reverse-proxy setups.
const OAUTH_ISSUER   = (import.meta.env.VITE_OAUTH_ISSUER ?? ADMIN_API_URL).trim().replace(/\/+$/, '')

export const AUTHORIZE_ENDPOINT = `${OAUTH_ISSUER}/oauth/authorize`
export const TOKEN_ENDPOINT     = `${OAUTH_ISSUER}/oauth/token`
/**
 * The admin refresh channel is the hardened `/oauth/token` refresh grant: the
 * HttpOnly refresh cookie is set AND read there (cookie `Path=/oauth/token`), so
 * it is the only endpoint the browser will send it to. It enforces rotation +
 * single-use/replay detection + DPoP. (Confirmed against go-oauth2 v1.1.x and
 * docs/ADMIN-SPA-MIGRATION.md §3.)
 */
export const REFRESH_ENDPOINT   = TOKEN_ENDPOINT

/** sessionStorage key holding the transient, single-use PKCE login state. */
const PKCE_STORAGE_KEY = 'socrate.pkce'

// ─── Types ──────────────────────────────────────────────────────────────────
export interface TokenResponse {
  access_token: string
  token_type?:  string
  expires_in?:  number
  id_token?:    string
}

/** Query parameters the AS appends to the redirect_uri on the way back. */
export interface CallbackParams {
  code?:              string
  state?:             string
  error?:             string
  error_description?: string
}

interface PkceState {
  verifier: string
  state:    string
  nonce:    string
  /** App path to return to after a successful login (deep-link preservation). */
  redirect?: string
}

/** An error originating from the OAuth/OIDC flow (carries the AS error code). */
export class OAuthError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'OAuthError'
    this.code = code
  }
}

export function isOAuthError(err: unknown): err is OAuthError {
  return err instanceof OAuthError
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
function redirectUri(): string {
  return `${window.location.origin}${REDIRECT_PATH}`
}

function savePkceState(s: PkceState): void {
  sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(s))
}

function loadPkceState(): PkceState | null {
  const raw = sessionStorage.getItem(PKCE_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PkceState
  } catch {
    return null
  }
}

function clearPkceState(): void {
  sessionStorage.removeItem(PKCE_STORAGE_KEY)
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Begin Authorization Code + PKCE login by redirecting the browser to the AS
 * hosted login. The verifier, state and nonce are persisted in sessionStorage
 * so {@link completeLogin} can finish the exchange after the round-trip.
 *
 * In the happy path the browser navigates away and nothing after the redirect
 * runs; the returned promise only rejects on a misconfiguration.
 */
export async function beginLogin(returnPath?: string): Promise<void> {
  if (!CLIENT_ID) {
    throw new OAuthError('VITE_OAUTH_CLIENT_ID is not configured', 'config_error')
  }

  const verifier  = generateCodeVerifier()
  const challenge = await deriveCodeChallenge(verifier)
  const state     = generateState()
  const nonce     = generateNonce()

  savePkceState({ verifier, state, nonce, redirect: returnPath })

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             CLIENT_ID,
    redirect_uri:          redirectUri(),
    scope:                 SCOPES,
    state,
    nonce,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  })

  window.location.assign(`${AUTHORIZE_ENDPOINT}?${params.toString()}`)
}

/**
 * Complete the PKCE flow from the `/auth/callback` route: validate the returned
 * `state` against the value stored before the redirect (CSRF / mix-up
 * protection, RFC 6749 §10.12), then exchange the code + verifier for tokens.
 *
 * The verifier is single-use and is cleared whether or not the exchange
 * succeeds. Returns the access token plus the app path to navigate to.
 */
export async function completeLogin(
  params: CallbackParams,
): Promise<{ accessToken: string; returnPath?: string }> {
  const saved = loadPkceState()
  // Single-use: discard the verifier immediately, success or failure.
  clearPkceState()

  if (params.error) {
    throw new OAuthError(params.error_description || params.error, params.error)
  }
  if (!params.code || !params.state) {
    throw new OAuthError('Malformed authorization response (missing code or state).')
  }
  if (!saved) {
    throw new OAuthError('No sign-in is in progress. Please start again.')
  }
  if (params.state !== saved.state) {
    throw new OAuthError('State mismatch — possible CSRF. Please sign in again.', 'state_mismatch')
  }

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code:          params.code,
    redirect_uri:  redirectUri(),
    client_id:     CLIENT_ID,
    code_verifier: saved.verifier,
  })

  const { data } = await axios.post<TokenResponse>(TOKEN_ENDPOINT, body, {
    withCredentials: true,
    headers: {
      'Content-Type':   'application/x-www-form-urlencoded',
      'X-Requested-By': 'oauth2-admin',
    },
  })

  return { accessToken: data.access_token, returnPath: saved.redirect }
}

/**
 * Exchange the HttpOnly refresh-token cookie for a fresh access token. Used by
 * both cold-start re-hydration (authStore.checkAuth) and the 401 response
 * interceptor (api.ts) — the single source of truth for the refresh contract.
 *
 * Per docs/ADMIN-SPA-MIGRATION.md §3: POST /oauth/token with
 * `grant_type=refresh_token&client_id=…`. The refresh token itself is NOT in the
 * body — the backend reads it from the HttpOnly cookie (sent because
 * withCredentials is true), rotates it (single-use; replay → family revocation),
 * and sets the fresh cookie on the response.
 */
export async function refreshAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id:  CLIENT_ID,
  })

  const { data } = await axios.post<TokenResponse>(REFRESH_ENDPOINT, body, {
    withCredentials: true,
    headers: {
      'Content-Type':   'application/x-www-form-urlencoded',
      'X-Requested-By': 'oauth2-admin',
    },
  })
  return data.access_token
}
