/**
 * Tests for src/stores/authStore.ts
 *
 * Covers the BFF cookie-session auth state machine:
 *   loginRedirect() → full-page navigation to /bff/login (via session.startLogin)
 *   logout()        → revoke the BFF session (bffLogout)
 *   checkAuth()     → GET /bff/session, then load the admin profile
 *   role-derived computed properties
 *   _loadProfile() role normalisation (F-14)
 *   forced-password-change gate
 *
 * Security relevance:
 *  F-01 — the browser holds NO tokens; auth rides on the HttpOnly session cookie
 *  F-14 — roles must be normalised before storage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import * as authService from '@/services/authService'
import * as session from '@/services/session'
import {
  passwordChangeRequired,
  flagPasswordChangeRequired,
  clearPasswordChangeRequired,
} from '@/services/adminGuards'
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
vi.mock('@/services/session', () => ({
  fetchSession: vi.fn(),
  bffLogout:    vi.fn(),
  startLogin:   vi.fn(),
}))

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

const authedSession = { authenticated: true as const, user: { sub: 'u1', email: mockUser.email, name: mockUser.name, roles: ['super_admin'] }, csrf: 'csrf-1' }

function buildStore() {
  setActivePinia(createPinia())
  return useAuthStore()
}

beforeEach(() => {
  vi.clearAllMocks()
  clearPasswordChangeRequired()
})

// ─── loginRedirect() ──────────────────────────────────────────────────────────
describe('authStore.loginRedirect()', () => {
  it('delegates to session.startLogin with the safe return path', async () => {
    const store = buildStore()

    await store.loginRedirect('/apps/123')

    expect(session.startLogin).toHaveBeenCalledWith('/apps/123')
    expect(store.error).toBeNull()
  })
})

// ─── checkAuth() ─────────────────────────────────────────────────────────────
describe('authStore.checkAuth()', () => {
  it('loads the profile and authenticates when the BFF session is valid', async () => {
    vi.mocked(session.fetchSession).mockResolvedValueOnce(authedSession)
    vi.mocked(authService.getProfile).mockResolvedValueOnce(mockUser)
    const store = buildStore()

    const result = await store.checkAuth()

    expect(result).toBe(true)
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.email).toBe(mockUser.email)
  })

  it('normalises a legacy "superadmin" role to "super_admin" (F-14)', async () => {
    vi.mocked(session.fetchSession).mockResolvedValueOnce(authedSession)
    vi.mocked(authService.getProfile).mockResolvedValueOnce({ ...mockUser, role: 'superadmin' as never })
    const store = buildStore()

    await store.checkAuth()

    expect(store.user?.role).toBe('super_admin')
  })

  it('returns false and clears state when there is no BFF session', async () => {
    vi.mocked(session.fetchSession).mockResolvedValueOnce({ authenticated: false })
    const store = buildStore()

    const result = await store.checkAuth()

    expect(result).toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(authService.getProfile).not.toHaveBeenCalled()
  })

  it('returns false and clears state when the profile load fails', async () => {
    vi.mocked(session.fetchSession).mockResolvedValueOnce(authedSession)
    vi.mocked(authService.getProfile).mockRejectedValueOnce(new Error('500'))
    const store = buildStore()

    const result = await store.checkAuth()

    expect(result).toBe(false)
    expect(store.user).toBeNull()
  })
})

// ─── logout() ────────────────────────────────────────────────────────────────
describe('authStore.logout()', () => {
  it('revokes the BFF session and clears user state', async () => {
    vi.mocked(session.bffLogout).mockResolvedValueOnce(undefined)
    const store = buildStore()
    store.user = mockUser

    await store.logout()

    expect(session.bffLogout).toHaveBeenCalled()
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('still clears state even if the logout call throws (best-effort)', async () => {
    vi.mocked(session.bffLogout).mockRejectedValueOnce(new Error('Server unreachable'))
    const store = buildStore()
    store.user = mockUser

    await store.logout().catch(() => { /* expected re-throw after finally */ })

    expect(store.user).toBeNull()
  })
})

// ─── Role-derived computed properties ────────────────────────────────────────
describe('authStore role computed properties', () => {
  async function loginAs(role: string) {
    const store = buildStore()
    vi.mocked(session.fetchSession).mockResolvedValueOnce(authedSession)
    vi.mocked(authService.getProfile).mockResolvedValueOnce({ ...mockUser, role: role as never })
    await store.checkAuth()
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

// ─── Forced password change ───────────────────────────────────────────────────
describe('authStore — forced password change', () => {
  it('checkAuth stays quiet and keeps the gate when a change is required', async () => {
    vi.mocked(session.fetchSession).mockResolvedValueOnce(authedSession)
    // Simulate the interceptor flagging the gate as the profile load is rejected.
    vi.mocked(authService.getProfile).mockImplementationOnce(async () => {
      flagPasswordChangeRequired()
      throw { response: { status: 403, data: { error: 'password_change_required' } } }
    })
    const store = buildStore()

    const result = await store.checkAuth()

    expect(result).toBe(false)
    expect(passwordChangeRequired.value).toBe(true)  // gate kept
    expect(store.error).toBeNull()                   // no scary "sign-in failed"
  })

  it('onPasswordChanged clears the flag + user and revokes the session', async () => {
    vi.mocked(session.bffLogout).mockResolvedValueOnce(undefined)
    flagPasswordChangeRequired()
    const store = buildStore()
    store.user = mockUser

    await store.onPasswordChanged()

    expect(store.user).toBeNull()
    expect(passwordChangeRequired.value).toBe(false)
    expect(session.bffLogout).toHaveBeenCalled()
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
