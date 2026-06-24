import api from './api'
import type {
  User,
  LoginRequest,
  LoginResult,
  MfaVerifyRequest,
  ChangePasswordRequest,
  Session,
} from '@/types/auth'

export async function login(credentials: LoginRequest): Promise<LoginResult> {
  const response = await api.post<LoginResult>('/api/admin/login', {
    email:    credentials.email,
    password: credentials.password,
  })
  return response.data
}

/** Verify MFA code and complete login.  Returns full LoginResponse on success. */
export async function verifyMfa(payload: MfaVerifyRequest): Promise<LoginResult> {
  const response = await api.post<LoginResult>('/api/admin/mfa/verify', payload)
  return response.data
}

export async function logout(): Promise<void> {
  // Best-effort — always proceed to clear client state even if server call fails
  await api.post('/api/admin/logout').catch(() => {/* swallow */})
}

export async function getProfile(): Promise<User> {
  const response = await api.get<User>('/api/admin/profile')
  return response.data
}

export async function updateProfile(data: Partial<User>): Promise<User> {
  const response = await api.put<User>('/api/admin/profile', data)
  return response.data
}

export async function changePassword(data: ChangePasswordRequest): Promise<void> {
  await api.post('/api/admin/change-password', data)
}

export async function getSessions(): Promise<Session[]> {
  const response = await api.get<Session[]>('/api/admin/sessions')
  return response.data
}

export async function revokeSession(sessionId: string): Promise<void> {
  await api.delete(`/api/admin/sessions/${sessionId}`)
}

export async function revokeAllSessions(): Promise<void> {
  await api.delete('/api/admin/sessions')
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post('/api/admin/request-password-reset', { email })
}

/**
 * Reset password.
 * Token is read from the URL fragment by the view and passed here in the
 * request body — it is NEVER forwarded in a query parameter (F-08).
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  await api.post('/api/admin/reset-password', { token, password })
}
