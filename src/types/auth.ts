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
  /**
   * TOTP code. Only sent on the SECOND login attempt, after the server has
   * replied `mfa_required` to a credentials-only attempt (see PendingMfa).
   */
  mfa_code?: string
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

/**
 * Socrate admin MFA model.
 *
 * The admin API (port 8081) has NO separate MFA-verify endpoint. When an admin
 * with MFA enabled posts valid credentials to `POST /api/admin/login`, the
 * server replies `401 { error: "mfa_required" }`. The client then RE-SUBMITS
 * the same login request with an additional `mfa_code` field. A wrong code
 * yields `401 { error: "invalid mfa code" }`; a policy that mandates enrolment
 * yields `403 { error: "mfa_enrollment_required" }`.
 *
 * Because the protocol is a stateless re-submit, there is no server-issued
 * token to carry between the two steps — the credentials themselves are
 * replayed. The auth store holds them in memory for the duration of the
 * challenge only.
 */
export const ADMIN_LOGIN_ERRORS = {
  MFA_REQUIRED:            'mfa_required',
  MFA_INVALID_CODE:        'invalid mfa code',
  MFA_ENROLLMENT_REQUIRED: 'mfa_enrollment_required',
} as const

/** Pending second-factor state, set after the server replies `mfa_required`. */
export interface PendingMfa {
  user_email: string
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
}
