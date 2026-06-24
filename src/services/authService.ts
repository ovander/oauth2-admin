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
