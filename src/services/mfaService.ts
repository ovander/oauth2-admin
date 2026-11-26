import api from './api'

// MFA self-service for the signed-in operator. The calls go same-origin to the
// BFF, which allowlists each /api/profile/mfa route, injects the session's
// bearer and checks CSRF on the POSTs; the issuer does the work. Nothing here
// is stored in the browser: the enrolment secret and the recovery codes are
// shown once and kept only in component state.

/** MfaStatus is the issuer's MFA state for the signed-in user. */
export interface MfaStatus {
  enabled: boolean
  recovery_codes_remaining: number
}

/** MfaEnrollment is a pending enrolment: the TOTP secret and its otpauth:// URI. */
export interface MfaEnrollment {
  secret: string
  provisioning_uri: string
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const response = await api.get<MfaStatus>('/api/profile/mfa')
  return response.data
}

/** beginMfaEnrollment starts an enrolment; MFA is enabled only after confirmMfa. */
export async function beginMfaEnrollment(): Promise<MfaEnrollment> {
  const response = await api.post<MfaEnrollment>('/api/profile/mfa/enroll')
  return response.data
}

/**
 * confirmMfa enables MFA with a code from the authenticator app and returns the
 * first recovery codes, which Socrate sends with the confirmation since v1.16.1
 * (the code just used cannot be used again to ask for them). An older Socrate,
 * or one that could not generate them, answers 204: the list is then empty.
 */
export async function confirmMfa(code: string): Promise<string[]> {
  const response = await api.post<{ recovery_codes?: string[] } | ''>('/api/profile/mfa/confirm', { code })
  const data = response.data
  return data && Array.isArray(data.recovery_codes) ? data.recovery_codes : []
}

/**
 * generateRecoveryCodes replaces the recovery codes and returns the new set
 * (shown once). With the password and a current code, it re-proves the account
 * first, as Socrate requires under MFA_RECOVERY_CODES_REVERIFY_MODE=enforce.
 */
export async function generateRecoveryCodes(password?: string, code?: string): Promise<string[]> {
  const body = code ? { password: password ?? '', code } : undefined
  const response = await api.post<{ recovery_codes: string[] }>('/api/profile/mfa/recovery-codes', body)
  return response.data.recovery_codes
}

/** disableMfa turns MFA off; the issuer requires the password and a current code. */
export async function disableMfa(password: string, code: string): Promise<void> {
  await api.post('/api/profile/mfa/disable', { password, code })
}
