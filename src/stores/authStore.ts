import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import * as authService from '@/services/authService'
import * as oauth from '@/services/oauth'
import { tokenStore } from '@/services/api'
import { passwordChangeRequired, clearPasswordChangeRequired } from '@/services/adminGuards'
import { normalizeRole } from '@/types/auth'
import { isSuperAdminRole, isAppAdminRole, canManageUsersRole } from '@/utils/roles'
import type { User } from '@/types/auth'

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

  // ─── Getters ──────────────────────────────────────────────────────────────
  const isAuthenticated = computed(() => !!user.value && !!tokenStore.get())
  const isSuperAdmin    = computed(() => isSuperAdminRole(user.value?.role))
  const isAppAdmin      = computed(() => isAppAdminRole(user.value?.role))
  const canManageUsers  = computed(() => canManageUsersRole(user.value?.role))

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
  /**
   * Start Authorization Code + PKCE login by redirecting the browser to the
   * authorization server's hosted login. Credentials and MFA are handled there,
   * not in the SPA. `returnPath` (a safe internal path) is preserved across the
   * round-trip so the user lands back where they intended.
   *
   * In the happy path the browser navigates away; this only returns/throws on a
   * misconfiguration before the redirect.
   */
  async function loginRedirect(returnPath?: string): Promise<void> {
    error.value     = null
    isLoading.value = true
    try {
      await oauth.beginLogin(returnPath)
    } catch (err: unknown) {
      isLoading.value = false
      error.value = oauth.isOAuthError(err)
        ? err.message
        : 'Unable to start sign-in. Please try again.'
      throw err
    }
  }

  /**
   * Complete the PKCE flow from the `/auth/callback` route: validate state,
   * exchange the code for tokens, then load the profile. Returns the result and
   * the safe path to navigate to. On failure, client state is cleared and
   * `error` carries a user-facing message.
   */
  async function handleCallback(
    params: oauth.CallbackParams,
  ): Promise<{ ok: boolean; returnPath?: string }> {
    isLoading.value = true
    error.value     = null
    try {
      const { accessToken, returnPath } = await oauth.completeLogin(params)
      tokenStore.set(accessToken)
      await _loadProfile()
      return { ok: true, returnPath }
    } catch (err: unknown) {
      // A forced password change surfaces as 403 during the profile load. Keep
      // the access token (the change-password call needs it) and stay quiet —
      // the router guard / global watcher routes to the change-password page.
      if (passwordChangeRequired.value) {
        return { ok: false }
      }
      tokenStore.clear()
      user.value = null
      error.value = oauth.isOAuthError(err)
        ? err.message
        : errorMessage(err) ?? 'Sign-in could not be completed. Please try again.'
      return { ok: false }
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    try {
      // Revokes the refresh token and clears the HttpOnly cookie server-side.
      await authService.logout()
    } finally {
      tokenStore.clear()
      user.value = null
      router.push({ name: 'Login' })
    }
  }

  /**
   * Called by the router on every cold navigation to re-hydrate state after a
   * page reload. The in-memory access token is gone; we attempt a silent
   * refresh using the HttpOnly refresh-token cookie. If that fails, the user is
   * not authenticated.
   */
  async function checkAuth(): Promise<boolean> {
    // If we already have a token in memory, validate it with a profile call.
    if (tokenStore.get()) {
      try {
        await _loadProfile()
        return true
      } catch {
        // Keep the (valid but gated) token if a password change is required.
        if (!passwordChangeRequired.value) tokenStore.clear()
        user.value = null
        return false
      }
    }

    // No in-memory token — try a silent refresh via the HttpOnly cookie.
    // Note: if the refresh succeeds but the profile is gated by a forced
    // password change, the fresh token stays in tokenStore so the
    // change-password call can authenticate.
    try {
      const accessToken = await oauth.refreshAccessToken()
      tokenStore.set(accessToken)
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
      error.value = errorMessage(err) ?? 'Failed to update profile'
      return false
    }
  }

  /**
   * Called after a successful forced/self-service password change. The backend
   * has revoked all tokens, so drop local state, clear the gate, and route to a
   * fresh login.
   */
  function onPasswordChanged() {
    clearPasswordChangeRequired()
    tokenStore.clear()
    user.value = null
    router.push({ name: 'Login', query: { changed: '1' } })
  }

  function clearError() { error.value = null }

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    isSuperAdmin,
    isAppAdmin,
    canManageUsers,
    loginRedirect,
    handleCallback,
    logout,
    checkAuth,
    updateProfile,
    onPasswordChanged,
    clearError,
  }
})
