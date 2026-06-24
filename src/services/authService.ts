import api from './api'
import type { User } from '@/types/auth'

// Admin login is no longer a first-party password request. Authentication is an
// Authorization Code + PKCE flow delegated to the AS hosted login — see
// services/oauth.ts and the auth store's loginRedirect()/handleCallback().

export async function logout(): Promise<void> {
  // Revoke the refresh token + clear the HttpOnly cookie server-side. The route
  // lives on the public auth API. Best-effort — the store always clears client
  // state regardless of the outcome.
  await api.post('/api/auth/logout').catch(() => {/* swallow */})
}

export async function getProfile(): Promise<User> {
  const response = await api.get<User>('/api/admin/profile')
  return response.data
}

/**
 * Step-up (elevation) re-authentication for destructive admin actions
 * (ADMIN-SPA-MIGRATION.md §5). Returns a FRESH access token (new `auth_time`);
 * the session/refresh cookie is unchanged. Use the returned token to retry the
 * action that triggered `403 elevation_required`.
 *
 * A wrong/absent MFA code rejects with `401 { error: "mfa_required" }` or
 * `401 { error: "invalid mfa code" }` — the caller re-prompts and resubmits.
 */
export async function elevate(password: string, mfaCode?: string): Promise<string> {
  const response = await api.post<{ access_token: string }>('/api/admin/elevate', {
    password,
    ...(mfaCode ? { mfa_code: mfaCode } : {}),
  })
  return response.data.access_token
}

/**
 * Forced/self-service password change (ADMIN-SPA-MIGRATION.md §6). On success
 * the backend revokes ALL tokens, so the caller must clear local state and
 * start a fresh login.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post('/api/admin/change-password', {
    current_password: currentPassword,
    new_password:     newPassword,
  })
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
