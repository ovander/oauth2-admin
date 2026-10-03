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

/** confirmMfa enables MFA with a code from the authenticator app. */
export async function confirmMfa(code: string): Promise<void> {
  await api.post('/api/profile/mfa/confirm', { code })
}

/** generateRecoveryCodes replaces the recovery codes and returns the new set (shown once). */
export async function generateRecoveryCodes(): Promise<string[]> {
  const response = await api.post<{ recovery_codes: string[] }>('/api/profile/mfa/recovery-codes')
  return response.data.recovery_codes
}

/** disableMfa turns MFA off; the issuer requires the password and a current code. */
export async function disableMfa(password: string, code: string): Promise<void> {
  await api.post('/api/profile/mfa/disable', { password, code })
}
