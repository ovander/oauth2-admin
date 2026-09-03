import api from './api'
import type { User } from '@/types/auth'

// Authentication is an Authorization Code + PKCE flow driven entirely by the BFF
// (server-side). The SPA holds no tokens — see services/session.ts. Login,
// logout and step-up elevation all go through the BFF (`/bff/*`).
//
// Every call is same-origin through the BFF, which allowlists the admin API
// (`/api/admin/*`, cookie auth), the issuer's profile self-service
// (`/api/profile`) and — P3-23 — the public, pre-auth password-reset posts.

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
  // Profile self-service lives on the issuer (`/api/profile`); the admin
  // `/api/admin/profile` route is read-only. The BFF allowlists and proxies
  // `/api/profile` with server-side bearer injection + CSRF, so this is a
  // same-origin cookie call — no token in the browser.
  const response = await api.put<User>('/api/profile', data)
  return response.data
}

export async function requestPasswordReset(email: string): Promise<void> {
  // Public issuer flow, reached same-origin through the BFF allowlist (P3-23):
  // previously this posted to the configured issuer origin, where the request
  // either failed CORS or "succeeded" against the wrong host.
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
