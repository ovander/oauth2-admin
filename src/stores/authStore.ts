import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import * as authService from '@/services/authService'
import { fetchSession, bffLogout, startLogin } from '@/services/session'
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
  // Auth is established when a profile has been loaded against a valid BFF
  // session cookie. There is NO access token in the browser anymore.
  const isAuthenticated = computed(() => !!user.value)
  const isSuperAdmin    = computed(() => isSuperAdminRole(user.value?.role))
  const isAppAdmin      = computed(() => isAppAdminRole(user.value?.role))
  const canManageUsers  = computed(() => canManageUsersRole(user.value?.role))

  // ─── Helpers ──────────────────────────────────────────────────────────────
  /**
   * Fetch the admin profile and normalise the role. Requires an authenticated
   * BFF session (the cookie) — the BFF injects the bearer server-side.
   */
  async function _loadProfile(): Promise<void> {
    const profile = await authService.getProfile()
    user.value = { ...profile, role: normalizeRole(profile.role) }
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  /**
   * Start login via a full-page navigation to the BFF (`/bff/login`). The BFF
   * runs the Authorization Code + PKCE flow, mints the session cookie, and
   * returns the browser to `returnPath`. The browser navigates away, so nothing
   * after this call runs in the happy path.
   */
  async function loginRedirect(returnPath?: string): Promise<void> {
    error.value     = null
    isLoading.value = true
    startLogin(returnPath)
  }

  async function logout() {
    try {
      // Revoke the server-side session and clear the HttpOnly cookie.
      await bffLogout()
    } finally {
      user.value = null
      router.push({ name: 'Login' })
    }
  }

  /**
   * Re-hydrate auth state on every cold navigation. Asks the BFF whether a
   * session cookie is valid (`GET /bff/session`); if so, loads the full admin
   * profile. A forced-password-change gate surfaces as a 403 on the profile
   * load — the flag is kept so the router routes to the change-password page.
   */
  async function checkAuth(): Promise<boolean> {
    try {
      const session = await fetchSession()
      if (!session.authenticated) {
        user.value = null
        return false
      }
      await _loadProfile()
      return true
    } catch {
      // Authenticated but gated (e.g. password change required): keep the gate.
      if (passwordChangeRequired.value) return false
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
   * has revoked all tokens (so the BFF session is dead); clear local state,
   * revoke the cookie best-effort, and route to a fresh login.
   */
  async function onPasswordChanged() {
    clearPasswordChangeRequired()
    user.value = null
    await bffLogout().catch(() => {/* session already invalid — ignore */})
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
    logout,
    checkAuth,
    updateProfile,
    onPasswordChanged,
    clearError,
  }
})
