/**
 * Tests for src/stores/authStore.ts
 *
 * Covers the full login state machine:
 *   login() → 'ok' | 'mfa_required' | 'error'
 *   verifyMfa() → true | false
 *   logout()
 *   checkAuth()
 *   role-derived computed properties
 *   _loadProfile() role normalisation (F-14)
 *
 * Security relevance:
 *  F-01 — tokens must only flow through tokenStore, never localStorage
 *  F-05 — MFA state transitions must be correct
 *  F-14 — roles must be normalised before storage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import { tokenStore } from '@/services/api'
import * as authService from '@/services/authService'
import type { LoginResponse, MfaChallengeResponse, User } from '@/types/auth'

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

// ─── Mock authService so we control what the API returns ─────────────────────
vi.mock('@/services/authService')

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

// Login response no longer embeds a user object — the store calls getProfile()
const mockLoginResponse: LoginResponse = {
  access_token: 'eyJhbGciOiJSUzI1NiJ9.access',
  token_type:   'Bearer',
  expires_in:   900,
}

const mockMfaChallenge: MfaChallengeResponse = {
  requires_mfa: true,
  mfa_token:    'mfa-server-session-token',
  mfa_type:     'totp',
  user_email:   'admin@example.com',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildStore() {
  setActivePinia(createPinia())
  return useAuthStore()
}

// ─── login() ─────────────────────────────────────────────────────────────────

describe('authStore.login()', () => {
  beforeEach(() => { tokenStore.clear() })

  it('returns "ok" and stores token on successful login', async () => {
    vi.mocked(authService.login).mockResolvedValueOnce(mockLoginResponse)
    vi.mocked(authService.getProfile).mockResolvedValueOnce(mockUser)
    const store = buildStore()

    const result = await store.login({ email: 'admin@example.com', password: 'correct-pass' })

    expect(result).toBe('ok')
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.email).toBe('admin@example.com')
    expect(tokenStore.get()).toBe(mockLoginResponse.access_token)
  })

  it('returns "mfa_required" and stores pending challenge when backend demands MFA', async () => {
    vi.mocked(authService.login).mockResolvedValueOnce(mockMfaChallenge)
    const store = buildStore()

    const result = await store.login({ email: 'admin@example.com', password: 'pass' })

    expect(result).toBe('mfa_required')
    expect(store.mfaRequired).toBe(true)
    expect(store.pendingMfa).toEqual(mockMfaChallenge)
    // Must NOT be authenticated yet — MFA not completed
    expect(store.isAuthenticated).toBe(false)
    expect(tokenStore.get()).toBeNull()
  })

  it('returns "error" and sets error message on API failure', async () => {
    vi.mocked(authService.login).mockRejectedValueOnce({
      response: { data: { message: 'Invalid credentials' } },
    })
    const store = buildStore()

    const result = await store.login({ email: 'bad@user.com', password: 'wrong' })

    expect(result).toBe('error')
    expect(store.error).toBe('Invalid credentials')
    expect(store.isAuthenticated).toBe(false)
  })

  it('normalises a legacy "superadmin" role to "super_admin" (F-14)', async () => {
    vi.mocked(authService.login).mockResolvedValueOnce(mockLoginResponse)
    vi.mocked(authService.getProfile).mockResolvedValueOnce({ ...mockUser, role: 'superadmin' as any })
    const store = buildStore()

    await store.login({ email: 'admin@example.com', password: 'pass' })

    expect(store.user?.role).toBe('super_admin')
  })

  it('clears isLoading after login completes', async () => {
    vi.mocked(authService.login).mockResolvedValueOnce(mockLoginResponse)
    vi.mocked(authService.getProfile).mockResolvedValueOnce(mockUser)
    const store = buildStore()

    await store.login({ email: 'admin@example.com', password: 'pass' })

    expect(store.isLoading).toBe(false)
  })

  it('clears isLoading even on error (finally block)', async () => {
    vi.mocked(authService.login).mockRejectedValueOnce(new Error('Network error'))
    const store = buildStore()

    await store.login({ email: 'x@x.com', password: 'p' })

    expect(store.isLoading).toBe(false)
  })
})

// ─── verifyMfa() ──────────────────────────────────────────────────────────────

describe('authStore.verifyMfa()', () => {
  beforeEach(() => { tokenStore.clear() })

  it('returns true, stores token, and clears pendingMfa on success', async () => {
    vi.mocked(authService.verifyMfa).mockResolvedValueOnce(mockLoginResponse)
    vi.mocked(authService.getProfile).mockResolvedValueOnce(mockUser)
    const store = buildStore()
    // Simulate having gone through the login step first
    store.pendingMfa = mockMfaChallenge

    const ok = await store.verifyMfa({ mfa_token: 'mfa-server-session-token', code: '123456' })

    expect(ok).toBe(true)
    expect(store.isAuthenticated).toBe(true)
    expect(store.pendingMfa).toBeNull()
    expect(tokenStore.get()).toBe(mockLoginResponse.access_token)
  })

  it('returns false and sets error when server returns another MFA challenge', async () => {
    vi.mocked(authService.verifyMfa).mockResolvedValueOnce(mockMfaChallenge)
    const store = buildStore()
    store.pendingMfa = mockMfaChallenge

    const ok = await store.verifyMfa({ mfa_token: 'tok', code: '000000' })

    expect(ok).toBe(false)
    expect(store.error).toBe('MFA verification failed')
    expect(store.isAuthenticated).toBe(false)
  })

  it('returns false and sets error on API failure', async () => {
    vi.mocked(authService.verifyMfa).mockRejectedValueOnce({
      response: { data: { message: 'Code expired' } },
    })
    const store = buildStore()

    const ok = await store.verifyMfa({ mfa_token: 'tok', code: '999999' })

    expect(ok).toBe(false)
    expect(store.error).toBe('Code expired')
  })
})

// ─── logout() ────────────────────────────────────────────────────────────────

describe('authStore.logout()', () => {
  it('clears user, token, and pendingMfa on successful API call', async () => {
    vi.mocked(authService.logout).mockResolvedValueOnce(undefined)
    const store = buildStore()
    tokenStore.set('existing-token')
    store.user = mockUser
    store.pendingMfa = mockMfaChallenge

    await store.logout()

    expect(tokenStore.get()).toBeNull()
    expect(store.user).toBeNull()
    expect(store.pendingMfa).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('still clears state even if API call throws (best-effort logout)', async () => {
    vi.mocked(authService.logout).mockRejectedValueOnce(new Error('Server unreachable'))
    const store = buildStore()
    tokenStore.set('existing-token')
    store.user = mockUser

    // The store has no catch block — the rejection re-throws after finally.
    // We catch it here so the test doesn't fail on the unhandled rejection,
    // then assert that the finally block still cleaned up state.
    await store.logout().catch(() => { /* expected */ })

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

  it('returns false and clears state when profile call fails (expired token)', async () => {
    tokenStore.set('expired-token')
    vi.mocked(authService.getProfile).mockRejectedValueOnce(new Error('401'))
    const store = buildStore()

    const result = await store.checkAuth()

    expect(result).toBe(false)
    expect(tokenStore.get()).toBeNull()
    expect(store.user).toBeNull()
  })

  it('returns false when no in-memory token and refresh cookie fails', async () => {
    // checkAuth() uses bare axios (not authService) for the refresh call,
    // so vi.mock('@/services/authService') doesn't cover it.
    // Override the MSW handler to simulate an expired/absent refresh cookie.
    const { server } = await import('../msw/server')
    const { http, HttpResponse } = await import('msw')
    server.use(
      http.post('https://api.test.example.com/api/auth/refresh', () =>
        HttpResponse.json({ message: 'No valid refresh session' }, { status: 401 }),
      ),
    )

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
    vi.mocked(authService.login).mockResolvedValueOnce(mockLoginResponse)
    vi.mocked(authService.getProfile).mockResolvedValueOnce({ ...mockUser, role: role as any })
    await store.login({ email: 'admin@example.com', password: 'pass' })
    return store
  }

  it('isSuperAdmin is true for super_admin role', async () => {
    const store = await loginAs('super_admin')
    expect(store.isSuperAdmin).toBe(true)
  })

  it('isSuperAdmin is false for app_admin role', async () => {
    const store = await loginAs('app_admin')
    expect(store.isSuperAdmin).toBe(false)
  })

  it('isAppAdmin is true for super_admin (superset)', async () => {
    const store = await loginAs('super_admin')
    expect(store.isAppAdmin).toBe(true)
  })

  it('isAppAdmin is true for app_admin', async () => {
    const store = await loginAs('app_admin')
    expect(store.isAppAdmin).toBe(true)
  })

  it('isAppAdmin is false for app_manager', async () => {
    const store = await loginAs('app_manager')
    expect(store.isAppAdmin).toBe(false)
  })

  it('canManageUsers is true for app_manager', async () => {
    const store = await loginAs('app_manager')
    expect(store.canManageUsers).toBe(true)
  })

  it('canManageUsers is false for viewer', async () => {
    const store = await loginAs('viewer')
    expect(store.canManageUsers).toBe(false)
  })
})

// ─── clearError / clearMfa ───────────────────────────────────────────────────

describe('authStore helper actions', () => {
  it('clearError() resets error to null', () => {
    const store = buildStore()
    store.error = 'Some error'
    store.clearError()
    expect(store.error).toBeNull()
  })

  it('clearMfa() resets pendingMfa to null', () => {
    const store = buildStore()
    store.pendingMfa = mockMfaChallenge
    store.clearMfa()
    expect(store.pendingMfa).toBeNull()
    expect(store.mfaRequired).toBe(false)
  })
})
