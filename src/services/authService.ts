import api from './api'
import type {
  User,
  LoginRequest,
  LoginResponse,
} from '@/types/auth'

/**
 * Admin login.
 *
 * On success the server returns a {@link LoginResponse}. When the admin has MFA
 * enabled, a credentials-only attempt is rejected with `401 mfa_required`; the
 * caller must re-invoke this function with `mfa_code` set (see the auth store).
 * All non-2xx responses reject with an AxiosError — the store inspects the
 * `error` field to drive the MFA flow.
 */
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/api/admin/login', {
    email:    credentials.email,
    password: credentials.password,
    // Only included on the second (MFA) attempt — omitted otherwise.
    ...(credentials.mfa_code ? { mfa_code: credentials.mfa_code } : {}),
  })
  return response.data
}

export async function logout(): Promise<void> {
  // The admin API has no logout route; refresh-token revocation lives on the
  // public auth API. Best-effort — the store always clears client state.
  await api.post('/api/auth/logout').catch(() => {/* swallow */})
}

export async function getProfile(): Promise<User> {
  const response = await api.get<User>('/api/admin/profile')
  return response.data
}

export async function updateProfile(data: Partial<User>): Promise<User> {
  // Profile self-service updates are served by the public profile API
  // (the admin `/api/admin/profile` route is read-only).
  const response = await api.put<User>('/api/profile', data)
  return response.data
}

export async function requestPasswordReset(email: string): Promise<void> {
  // Password reset is a public-API flow (no admin-side route exists).
  await api.post('/api/auth/request-password-reset', { email })
}

/**
 * Reset password.
 * Token is read from the URL fragment by the view and passed here in the
 * request body — it is NEVER forwarded in a query parameter (F-08).
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  await api.post('/api/auth/reset-password', { token, password })
}
