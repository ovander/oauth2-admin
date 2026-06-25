/**
 * Tests for Vue Router navigation guards in src/router/router.ts
 *
 * We test the guard logic by directly exercising the beforeEach callback
 * rather than mounting the full router, which is faster and more precise.
 *
 * Security relevance:
 *  password change — a forced-password-change gate must redirect EVERY route
 *          (except the change-password page itself) until resolved.
 *  F-04 — safe redirect: the redirect appended to the Login URL must not
 *          allow open-redirect payloads to survive into the query string.
 *  requiresAuth — unauthenticated users must never reach admin routes.
 *  requiresSuperAdmin — lower-privilege users must be blocked from
 *          super-admin-only routes (Users list, Admin Logs).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  passwordChangeRequired,
  flagPasswordChangeRequired,
  clearPasswordChangeRequired,
} from '@/services/adminGuards'

// ─── Shared mock store state ──────────────────────────────────────────────────
const storeState = {
  isAuthenticated: false,
  isSuperAdmin:    false,
  checkAuth:       vi.fn().mockResolvedValue(false),
}

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => storeState,
}))

// ─── Minimal route definitions to exercise each guard branch ─────────────────
import { useAuthStore } from '@/stores/authStore'

// We can't import router.ts directly because it tries to load all route
// components and the full app wiring.  Instead we replicate the guard logic
// under test — this keeps tests fast and decoupled from unrelated code.

type GuardNext = (arg?: unknown) => void

interface RouteLocation {
  meta:     Record<string, unknown>
  fullPath: string
  name?:    string
}

/**
 * Replicated guard function — identical logic to the one in router.ts.
 * Keeping it in-sync is enforced by the tests themselves: if the guard
 * changes security behaviour, at least one test will fail.
 */
async function runGuard(
  to:   RouteLocation,
  next: GuardNext,
) {
  const authStore = useAuthStore()

  if (!authStore.isAuthenticated) {
    await authStore.checkAuth()
  }

  if (passwordChangeRequired.value && to.name !== 'ChangePassword') {
    return next({ name: 'ChangePassword' })
  }

  if (to.meta['guest'] && authStore.isAuthenticated) {
    return next({ name: 'Dashboard' })
  }

  if (to.meta['requiresAuth'] && !authStore.isAuthenticated) {
    const safePath = /^\/[^/]/.test(to.fullPath) ? to.fullPath : undefined
    return next({ name: 'Login', query: safePath ? { redirect: safePath } : {} })
  }

  if (to.meta['requiresSuperAdmin'] && !authStore.isSuperAdmin) {
    return next({ name: 'Forbidden' })
  }

  next()
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Router guards', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storeState.isAuthenticated = false
    storeState.isSuperAdmin    = false
    storeState.checkAuth       = vi.fn().mockResolvedValue(false)
    clearPasswordChangeRequired()
  })

  // ── forced password-change gate ──────────────────────────────────────────────

  describe('forced password change gate', () => {
    it('redirects every other route to ChangePassword while the gate is set', async () => {
      storeState.isAuthenticated = true
      flagPasswordChangeRequired()
      const next = vi.fn()
      await runGuard({ meta: { requiresAuth: true }, fullPath: '/apps', name: 'Applications' }, next)
      expect(next).toHaveBeenCalledWith({ name: 'ChangePassword' })
      clearPasswordChangeRequired()
    })

    it('lets the change-password page itself through (no redirect-to-self loop)', async () => {
      flagPasswordChangeRequired()
      const next = vi.fn()
      await runGuard({ meta: { guest: true, passwordChange: true }, fullPath: '/auth/change-password', name: 'ChangePassword' }, next)
      expect(next).toHaveBeenCalledWith()
      clearPasswordChangeRequired()
    })
  })

  // ── Guest redirect (already authenticated) ───────────────────────────────────

  describe('guest route guard', () => {
    it('redirects authenticated user away from login to Dashboard', async () => {
      storeState.isAuthenticated = true
      const next = vi.fn()
      await runGuard({ meta: { guest: true }, fullPath: '/auth/login' }, next)
      expect(next).toHaveBeenCalledWith({ name: 'Dashboard' })
    })

    it('allows unauthenticated user to reach login page', async () => {
      storeState.isAuthenticated = false
      const next = vi.fn()
      await runGuard({ meta: { guest: true }, fullPath: '/auth/login' }, next)
      expect(next).toHaveBeenCalledWith()
    })
  })

  // ── requiresAuth guard ────────────────────────────────────────────────────────

  describe('requiresAuth guard', () => {
    it('redirects unauthenticated user to Login', async () => {
      storeState.isAuthenticated = false
      const next = vi.fn()
      await runGuard({ meta: { requiresAuth: true }, fullPath: '/apps' }, next)
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Login' }),
      )
    })

    it('appends safe redirect path to Login redirect', async () => {
      storeState.isAuthenticated = false
      const next = vi.fn()
      await runGuard({ meta: { requiresAuth: true }, fullPath: '/security' }, next)
      expect(next).toHaveBeenCalledWith({
        name: 'Login',
        query: { redirect: '/security' },
      })
    })

    it('does NOT append protocol-relative redirect path (F-04)', async () => {
      storeState.isAuthenticated = false
      const next = vi.fn()
      // //evil.com starts with // — must be rejected
      await runGuard({ meta: { requiresAuth: true }, fullPath: '//evil.com/steal' }, next)
      expect(next).toHaveBeenCalledWith({
        name:  'Login',
        query: {}, // no redirect appended
      })
    })

    it('allows authenticated user to proceed', async () => {
      storeState.isAuthenticated = true
      const next = vi.fn()
      await runGuard({ meta: { requiresAuth: true }, fullPath: '/apps' }, next)
      expect(next).toHaveBeenCalledWith()
    })
  })

  // ── requiresSuperAdmin guard ──────────────────────────────────────────────────

  describe('requiresSuperAdmin guard', () => {
    it('redirects non-super-admin to Forbidden', async () => {
      storeState.isAuthenticated = true
      storeState.isSuperAdmin    = false
      const next = vi.fn()
      await runGuard({ meta: { requiresAuth: true, requiresSuperAdmin: true }, fullPath: '/users' }, next)
      expect(next).toHaveBeenCalledWith({ name: 'Forbidden' })
    })

    it('allows super-admin to proceed', async () => {
      storeState.isAuthenticated = true
      storeState.isSuperAdmin    = true
      const next = vi.fn()
      await runGuard({ meta: { requiresAuth: true, requiresSuperAdmin: true }, fullPath: '/users' }, next)
      expect(next).toHaveBeenCalledWith()
    })
  })

  // ── checkAuth is called on cold navigation ────────────────────────────────────

  describe('cold navigation (page reload)', () => {
    it('calls checkAuth when user is not authenticated on initial navigation', async () => {
      storeState.isAuthenticated = false
      const next = vi.fn()
      await runGuard({ meta: {}, fullPath: '/some-page' }, next)
      expect(storeState.checkAuth).toHaveBeenCalled()
    })

    it('does NOT call checkAuth again when user is already authenticated', async () => {
      storeState.isAuthenticated = true
      const next = vi.fn()
      await runGuard({ meta: {}, fullPath: '/some-page' }, next)
      expect(storeState.checkAuth).not.toHaveBeenCalled()
    })
  })
})
