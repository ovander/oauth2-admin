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

export interface LoginRequest {
  email: string
  password: string
}

/** Normal fully-authenticated response */
export interface LoginResponse {
  access_token:          string
  /** Refresh token — the frontend sets it in a cookie and does not store it in JS. */
  refresh_token?:        string
  id_token?:             string
  token_type:            string
  expires_in:            number
  /** User profile is NOT embedded in the login response — call GET /api/admin/profile instead. */
  user_id?:              number
  roles?:                string[]
  app_roles?:            Record<string, string[]>
  must_change_password?: boolean
}

/** MFA challenge response — returned when a second factor is required */
export interface MfaChallengeResponse {
  requires_mfa: true
  mfa_token: string          // short-lived, server-side session token
  mfa_type: 'totp' | 'webauthn'
  user_email: string
}

export type LoginResult = LoginResponse | MfaChallengeResponse

/** Type guard */
export function isMfaChallenge(r: LoginResult): r is MfaChallengeResponse {
  return (r as MfaChallengeResponse).requires_mfa === true
}

export interface MfaVerifyRequest {
  mfa_token: string
  code: string
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
  confirm_password: string
}

export interface Session {
  id: string
  user_agent: string
  ip_address: string
  created_at: string
  last_active_at: string
  is_current: boolean
}
