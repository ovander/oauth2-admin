import api, { issuerApi } from './api'
import type { User } from '@/types/auth'

// Authentication is an Authorization Code + PKCE flow driven entirely by the BFF
// (server-side). The SPA holds no tokens — see services/session.ts. Login,
// logout and step-up elevation all go through the BFF (`/bff/*`).
//
// Endpoint → instance:
//   • api       → admin API via the BFF (same-origin /api/admin/*, cookie auth)
//   • issuerApi → public, pre-auth issuer flows the BFF does not proxy
//                 (forgot/reset password)

export async function getProfile(): Promise<User> {
  const response = await api.get<User>('/api/admin/profile')
  return response.data
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
  // Profile self-service is a public-API flow on the issuer (:8080); the admin
  // `/api/admin/profile` route is read-only.
  const response = await issuerApi.put<User>('/api/profile', data)
  return response.data
}

export async function requestPasswordReset(email: string): Promise<void> {
  // Password reset is a public-API (issuer) flow — no admin-side route exists.
  await issuerApi.post('/api/auth/request-password-reset', { email })
}

/**
 * Reset password.
 * Token is read from the URL fragment by the view and passed here in the
 * request body — it is NEVER forwarded in a query parameter (F-08).
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  await issuerApi.post('/api/auth/reset-password', { token, password })
}
