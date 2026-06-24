/**
 * Tests for src/stores/authStore.ts
 *
 * Covers the Authorization Code + PKCE auth state machine:
 *   loginRedirect()  → delegates to oauth.beginLogin (browser redirect)
 *   handleCallback() → exchanges the code, loads profile | surfaces errors
 *   logout()
 *   checkAuth()      → in-memory token | silent cookie refresh
 *   role-derived computed properties
 *   _loadProfile() role normalisation (F-14)
 *
 * Security relevance:
 *  F-01 — tokens must only flow through tokenStore, never localStorage
 *  F-03 — credentials/MFA are delegated to the AS; the SPA never holds them
 *  F-14 — roles must be normalised before storage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import { tokenStore } from '@/services/api'
import * as authService from '@/services/authService'
import * as oauth from '@/services/oauth'
import { OAuthError } from '@/services/oauth'
import type { User } from '@/types/auth'

// ─── Mock vue-router — spread actual exports so createRouter/createWebHistory
//     remain available for router.ts (loaded transitively via api.ts → router).
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useRoute:  () => ({ query: {}, params: {} }),
  }
})

// ─── Mock the service layer so we control I/O ────────────────────────────────
vi.mock('@/services/authService')
vi.mock('@/services/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/oauth')>()
  return {
    ...actual,                       // keep the real OAuthError / isOAuthError
    beginLogin:         vi.fn(),
    completeLogin:      vi.fn(),
    refreshAccessToken: vi.fn(),
  }
})

// ─── Test fixtures ────────────────────────────────────────────────────────────
const mockUser: User = {
  id:             1,
  email:          'admin@example.com',
  name:           'Test Admin',
  role:           'super_admin',
  email_verified: true,
  locked:         false,
  created_at:     '2024-01-01T00:00:00Z',
  updated_at:     '2024-01-01T00:00:00Z',
}

function buildStore() {
  setActivePinia(createPinia())
  return useAuthStore()
}

// ─── loginRedirect() ──────────────────────────────────────────────────────────
describe('authStore.loginRedirect()', () => {
  beforeEach(() => { tokenStore.clear() })

  it('delegates to oauth.beginLogin with the safe return path', async () => {
    vi.mocked(oauth.beginLogin).mockResolvedValueOnce(undefined)
    const store = buildStore()

    await store.loginRedirect('/apps/123')

    expect(oauth.beginLogin).toHaveBeenCalledWith('/apps/123')
    expect(store.error).toBeNull()
  })

  it('surfaces an OAuthError message and rethrows on a misconfiguration', async () => {
    vi.mocked(oauth.beginLogin).mockRejectedValueOnce(
      new OAuthError('VITE_OAUTH_CLIENT_ID is not configured', 'config_error'),
    )
    const store = buildStore()

    await expect(store.loginRedirect()).rejects.toThrow()
    expect(store.error).toMatch(/not configured/i)
    expect(store.isLoading).toBe(false)
  })
})

// ─── handleCallback() ─────────────────────────────────────────────────────────
describe('authStore.handleCallback()', () => {
  beforeEach(() => { tokenStore.clear() })

  it('exchanges the code, stores the token, loads the profile and returns the path', async () => {
    vi.mocked(oauth.completeLogin).mockResolvedValueOnce({ accessToken: 'pkce-access-token', returnPath: '/security' })
    vi.mocked(authService.getProfile).mockResolvedValueOnce(mockUser)
    const store = buildStore()

    const result = await store.handleCallback({ code: 'abc', state: 'xyz' })

    expect(result).toEqual({ ok: true, returnPath: '/security' })
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.email).toBe('admin@example.com')
    expect(tokenStore.get()).toBe('pkce-access-token')
  })

  it('normalises a legacy "superadmin" role to "super_admin" (F-14)', async () => {
    vi.mocked(oauth.completeLogin).mockResolvedValueOnce({ accessToken: 't' })
    vi.mocked(authService.getProfile).mockResolvedValueOnce({ ...mockUser, role: 'superadmin' as any })
    const store = buildStore()

    await store.handleCallback({ code: 'abc', state: 'xyz' })

    expect(store.user?.role).toBe('super_admin')
  })

  it('returns ok:false and clears state on a state mismatch (CSRF guard)', async () => {
    vi.mocked(oauth.completeLogin).mockRejectedValueOnce(
      new OAuthError('State mismatch — possible CSRF. Please sign in again.', 'state_mismatch'),
    )
    const store = buildStore()

    const result = await store.handleCallback({ code: 'abc', state: 'tampered' })

    expect(result.ok).toBe(false)
    expect(store.error).toMatch(/state mismatch/i)
    expect(store.isAuthenticated).toBe(false)
    expect(tokenStore.get()).toBeNull()
  })

  it('returns ok:false and surfaces the AS error_description', async () => {
    vi.mocked(oauth.completeLogin).mockRejectedValueOnce(
      new OAuthError('user cancelled', 'access_denied'),
    )
    const store = buildStore()

    const result = await store.handleCallback({ error: 'access_denied', error_description: 'user cancelled' })

    expect(result.ok).toBe(false)
    expect(store.error).toMatch(/cancelled/i)
  })

  it('clears isLoading after completion (finally block)', async () => {
    vi.mocked(oauth.completeLogin).mockRejectedValueOnce(new Error('boom'))
    const store = buildStore()

    await store.handleCallback({ code: 'abc', state: 'xyz' })

    expect(store.isLoading).toBe(false)
  })
})

// ─── logout() ────────────────────────────────────────────────────────────────
describe('authStore.logout()', () => {
  it('clears user and token on successful API call', async () => {
    vi.mocked(authService.logout).mockResolvedValueOnce(undefined)
    const store = buildStore()
    tokenStore.set('existing-token')
    store.user = mockUser

    await store.logout()

    expect(tokenStore.get()).toBeNull()
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('still clears state even if the API call throws (best-effort logout)', async () => {
    vi.mocked(authService.logout).mockRejectedValueOnce(new Error('Server unreachable'))
    const store = buildStore()
    tokenStore.set('existing-token')
    store.user = mockUser

    await store.logout().catch(() => { /* expected re-throw after finally */ })

    expect(tokenStore.get()).toBeNull()
    expect(store.user).toBeNull()
  })
})

// ─── checkAuth() ─────────────────────────────────────────────────────────────
describe('authStore.checkAuth()', () => {
  beforeEach(() => { tokenStore.clear() })

  it('returns true and keeps user when an in-memory token is valid', async () => {
    tokenStore.set('valid-access-token')
    vi.mocked(authService.getProfile).mockResolvedValueOnce(mockUser)
    const store = buildStore()

    const result = await store.checkAuth()

    expect(result).toBe(true)
    expect(store.user?.email).toBe(mockUser.email)
  })

  it('returns false and clears state when the profile call fails (expired token)', async () => {
    tokenStore.set('expired-token')
    vi.mocked(authService.getProfile).mockRejectedValueOnce(new Error('401'))
    const store = buildStore()

    const result = await store.checkAuth()

    expect(result).toBe(false)
    expect(tokenStore.get()).toBeNull()
    expect(store.user).toBeNull()
  })

  it('silently refreshes via the cookie when no in-memory token exists', async () => {
    vi.mocked(oauth.refreshAccessToken).mockResolvedValueOnce('refreshed-token')
    vi.mocked(authService.getProfile).mockResolvedValueOnce(mockUser)
    const store = buildStore()

    const result = await store.checkAuth()

    expect(result).toBe(true)
    expect(tokenStore.get()).toBe('refreshed-token')
    expect(store.isAuthenticated).toBe(true)
  })

  it('returns false when no in-memory token and the refresh cookie is absent', async () => {
    vi.mocked(oauth.refreshAccessToken).mockRejectedValueOnce(new Error('401'))
    const store = buildStore()

    const result = await store.checkAuth()

    expect(result).toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })
})

// ─── Role-derived computed properties ────────────────────────────────────────
describe('authStore role computed properties', () => {
  beforeEach(() => { tokenStore.clear() })

  async function loginAs(role: string) {
    const store = buildStore()
    vi.mocked(oauth.completeLogin).mockResolvedValueOnce({ accessToken: 'tok' })
    vi.mocked(authService.getProfile).mockResolvedValueOnce({ ...mockUser, role: role as any })
    await store.handleCallback({ code: 'abc', state: 'xyz' })
    return store
  }

  it('isSuperAdmin is true for super_admin role', async () => {
    expect((await loginAs('super_admin')).isSuperAdmin).toBe(true)
  })
  it('isSuperAdmin is false for app_admin role', async () => {
    expect((await loginAs('app_admin')).isSuperAdmin).toBe(false)
  })
  it('isAppAdmin is true for super_admin (superset)', async () => {
    expect((await loginAs('super_admin')).isAppAdmin).toBe(true)
  })
  it('isAppAdmin is true for app_admin', async () => {
    expect((await loginAs('app_admin')).isAppAdmin).toBe(true)
  })
  it('isAppAdmin is false for app_manager', async () => {
    expect((await loginAs('app_manager')).isAppAdmin).toBe(false)
  })
  it('canManageUsers is true for app_manager', async () => {
    expect((await loginAs('app_manager')).canManageUsers).toBe(true)
  })
  it('canManageUsers is false for viewer', async () => {
    expect((await loginAs('viewer')).canManageUsers).toBe(false)
  })
})

// ─── clearError ──────────────────────────────────────────────────────────────
describe('authStore helper actions', () => {
  it('clearError() resets error to null', () => {
    const store = buildStore()
    store.error = 'Some error'
    store.clearError()
    expect(store.error).toBeNull()
  })
})
