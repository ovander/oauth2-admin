import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import * as authService from '@/services/authService'
import { tokenStore } from '@/services/api'
import { isMfaChallenge, normalizeRole } from '@/types/auth'
import { isSuperAdminRole, isAppAdminRole, canManageUsersRole } from '@/utils/roles'
import type { User, LoginRequest, MfaVerifyRequest, MfaChallengeResponse } from '@/types/auth'

export const useAuthStore = defineStore('auth', () => {
  const router = useRouter()

  // ─── State ────────────────────────────────────────────────────────────────
  const user      = ref<User | null>(null)
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  /** Set when the server responds with requires_mfa: true */
  const pendingMfa = ref<MfaChallengeResponse | null>(null)

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
  async function login(credentials: LoginRequest): Promise<'ok' | 'mfa_required' | 'error'> {
    isLoading.value = true
    error.value     = null

    try {
      const result = await authService.login(credentials)

      if (isMfaChallenge(result)) {
        pendingMfa.value = result
        return 'mfa_required'
      }

      // The backend does not return a user object in the login response.
      // Set the token first so the subsequent getProfile() call can authenticate.
      tokenStore.set(result.access_token)
      pendingMfa.value = null
      await _loadProfile()
      return 'ok'
    } catch (err: unknown) {
      error.value = (err as any)?.response?.data?.message ?? 'Login failed'
      return 'error'
    } finally {
      isLoading.value = false
    }
  }

  async function verifyMfa(payload: MfaVerifyRequest): Promise<boolean> {
    isLoading.value = true
    error.value     = null

    try {
      const result = await authService.verifyMfa(payload)
      if (isMfaChallenge(result)) {
        error.value = 'MFA verification failed'
        return false
      }
      tokenStore.set(result.access_token)
      pendingMfa.value = null
      await _loadProfile()
      return true
    } catch (err: unknown) {
      error.value = (err as any)?.response?.data?.message ?? 'MFA verification failed'
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
      user.value      = null
      pendingMfa.value = null
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
  function clearMfa()   { pendingMfa.value = null }

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
