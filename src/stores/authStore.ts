import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import * as authService from '@/services/authService'
import { tokenStore } from '@/services/api'
import { normalizeRole, ADMIN_LOGIN_ERRORS } from '@/types/auth'
import { isSuperAdminRole, isAppAdminRole, canManageUsersRole } from '@/utils/roles'
import type { User, LoginRequest, PendingMfa } from '@/types/auth'

/** Extract the backend's `{ "error": "..." }` code from a failed request. */
function loginErrorCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error
}

/** Extract a human-readable `{ "message": "..." }` from a failed request. */
function errorMessage(err: unknown): string | undefined {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message
}

export const useAuthStore = defineStore('auth', () => {
  const router = useRouter()

  // ─── State ────────────────────────────────────────────────────────────────
  const user      = ref<User | null>(null)
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  /** Set after the server replies `mfa_required` to a credentials-only login. */
  const pendingMfa = ref<PendingMfa | null>(null)

  /**
   * Credentials retained in memory ONLY between an `mfa_required` response and
   * a successful second-factor submit. The admin login protocol is a stateless
   * re-submit (email + password + mfa_code), so the credentials must be
   * replayed. Never persisted to storage, never exposed by the store.
   */
  let pendingCredentials: LoginRequest | null = null

  // ─── Getters ──────────────────────────────────────────────────────────────
  const isAuthenticated = computed(() => !!user.value && !!tokenStore.get())
  const isSuperAdmin    = computed(() => isSuperAdminRole(user.value?.role))
  const isAppAdmin      = computed(() => isAppAdminRole(user.value?.role))
  const canManageUsers  = computed(() => canManageUsersRole(user.value?.role))
  const mfaRequired     = computed(() => !!pendingMfa.value)

  // ─── Helpers ──────────────────────────────────────────────────────────────
  /**
   * Fetch the admin profile and normalise the role.
   * Requires a valid access token to already be set in tokenStore.
   */
  async function _loadProfile(): Promise<void> {
    const profile = await authService.getProfile()
    user.value = { ...profile, role: normalizeRole(profile.role) }
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  async function login(
    credentials: LoginRequest,
  ): Promise<'ok' | 'mfa_required' | 'mfa_enrollment_required' | 'error'> {
    isLoading.value = true
    error.value     = null

    try {
      const result = await authService.login(credentials)

      // The backend does not return a user object in the login response.
      // Set the token first so the subsequent getProfile() call can authenticate.
      tokenStore.set(result.access_token)
      pendingMfa.value   = null
      pendingCredentials = null
      await _loadProfile()
      return 'ok'
    } catch (err: unknown) {
      const code = loginErrorCode(err)

      // MFA enabled: the server accepted the password but needs a TOTP code.
      // Retain the credentials so verifyMfa() can replay them with the code.
      if (code === ADMIN_LOGIN_ERRORS.MFA_REQUIRED) {
        pendingCredentials = { email: credentials.email, password: credentials.password }
        pendingMfa.value   = { user_email: credentials.email }
        return 'mfa_required'
      }

      // Policy requires the admin to enrol MFA before they can sign in.
      if (code === ADMIN_LOGIN_ERRORS.MFA_ENROLLMENT_REQUIRED) {
        error.value =
          'Multi-factor authentication enrolment is required before you can sign in. ' +
          'Enrol an authenticator app on your account, then sign in again.'
        return 'mfa_enrollment_required'
      }

      error.value = errorMessage(err) ?? 'Login failed'
      return 'error'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Complete an MFA challenge by re-submitting the held credentials together
   * with the TOTP code. Requires a prior login() that returned 'mfa_required'.
   */
  async function verifyMfa(code: string): Promise<boolean> {
    if (!pendingCredentials) {
      error.value = 'Your sign-in session expired. Please log in again.'
      return false
    }

    isLoading.value = true
    error.value     = null

    try {
      const result = await authService.login({ ...pendingCredentials, mfa_code: code })
      tokenStore.set(result.access_token)
      pendingMfa.value   = null
      pendingCredentials = null
      await _loadProfile()
      return true
    } catch (err: unknown) {
      error.value =
        loginErrorCode(err) === ADMIN_LOGIN_ERRORS.MFA_INVALID_CODE
          ? 'Invalid code. Please try again.'
          : errorMessage(err) ?? 'MFA verification failed'
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    try {
      await authService.logout()
    } finally {
      tokenStore.clear()
      user.value         = null
      pendingMfa.value   = null
      pendingCredentials = null
      router.push({ name: 'Login' })
    }
  }

  /**
   * Called by the router on every navigation to re-hydrate state after a
   * page reload.  The access token was in memory and is gone; we attempt a
   * silent refresh using the HttpOnly cookie.  If that fails, the user is
   * not authenticated.
   */
  async function checkAuth(): Promise<boolean> {
    // If we already have a token in memory, validate it with a profile call
    if (tokenStore.get()) {
      try {
        await _loadProfile()
        return true
      } catch {
        tokenStore.clear()
        user.value = null
        return false
      }
    }

    // No in-memory token — try silent refresh via the HttpOnly cookie.
    // The backend standard OAuth2 endpoint reads the refresh_token from the
    // cookie when withCredentials is true.
    try {
      const body = new URLSearchParams({ grant_type: 'refresh_token' })
      const { data } = await axios.post<{ access_token: string }>(
        `${import.meta.env.VITE_ADMIN_API_URL}/oauth/token`,
        body,
        {
          withCredentials: true,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-By': 'oauth2-admin',
          },
        },
      )
      tokenStore.set(data.access_token)
      await _loadProfile()
      return true
    } catch {
      user.value = null
      return false
    }
  }

  async function updateProfile(data: Partial<User>): Promise<boolean> {
    try {
      const updated = await authService.updateProfile(data)
      user.value = { ...updated, role: normalizeRole(updated.role) }
      return true
    } catch (err: unknown) {
      error.value = (err as any)?.response?.data?.message ?? 'Failed to update profile'
      return false
    }
  }

  function clearError() { error.value = null }
  function clearMfa()   { pendingMfa.value = null; pendingCredentials = null }

  return {
    user,
    isLoading,
    error,
    pendingMfa,
    isAuthenticated,
    isSuperAdmin,
    isAppAdmin,
    canManageUsers,
    mfaRequired,
    login,
    verifyMfa,
    logout,
    checkAuth,
    updateProfile,
    clearError,
    clearMfa,
  }
})
