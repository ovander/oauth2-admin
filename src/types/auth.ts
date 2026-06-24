// ─── Canonical Role Constants ─────────────────────────────────────────────
// Single source of truth for role strings (F-14)
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  APP_ADMIN:   'app_admin',
  APP_MANAGER: 'app_manager',
  VIEWER:      'viewer',
} as const

export type UserRole = typeof ROLES[keyof typeof ROLES]
// Legacy alias still accepted from some backend versions
type LegacyRole = 'superadmin' | 'admin' | 'user'
export type AnyUserRole = UserRole | LegacyRole

/** Normalise any role string the backend might return to a canonical UserRole */
export function normalizeRole(role: string): UserRole {
  if (role === 'superadmin') return ROLES.SUPER_ADMIN
  if (role === 'admin')      return ROLES.APP_ADMIN
  const known = Object.values(ROLES) as string[]
  if (known.includes(role))  return role as UserRole
  return ROLES.VIEWER
}

export interface User {
  id: number
  email: string
  name: string
  role: UserRole
  email_verified: boolean
  locked: boolean
  mfa_enabled?: boolean
  created_at: string
  updated_at: string
  last_login_at?: string
}

/**
 * Token response from the OAuth token endpoint (Authorization Code + PKCE
 * exchange and refresh). The refresh token is NOT included here — it is
 * delivered to the browser as an HttpOnly cookie and never exposed to JS.
 * Credentials and MFA are handled by the authorization server's hosted login,
 * so the SPA no longer issues a first-party password (ROPC) request.
 */
export interface TokenResponse {
  access_token: string
  token_type?:  string
  expires_in?:  number
  id_token?:    string
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
}
