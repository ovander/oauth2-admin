import type { RouteLocationRaw } from 'vue-router'
import { passwordChangeRequired } from '@/services/adminGuards'

/** The part of a route the navigation guard reads. */
export interface GuardTarget {
  meta: Record<string, unknown>
  fullPath: string
  name?: string | symbol | null
}

/** The part of the auth store the navigation guard reads. */
export interface GuardAuth {
  isAuthenticated: boolean
  isSuperAdmin: boolean
  checkAuth(): Promise<unknown>
}

/**
 * guardNavigation decides where a navigation to `to` goes: a redirect, or
 * undefined to proceed. router.ts runs it before every navigation.
 */
export async function guardNavigation(to: GuardTarget, auth: GuardAuth): Promise<RouteLocationRaw | undefined> {
  // Re-hydrate auth state on every cold navigation. This asks the BFF whether
  // the session cookie is valid (`GET /bff/session`) and, as a side effect,
  // loads the CSRF token needed by every state-changing request — including the
  // change-password form.
  if (!auth.isAuthenticated) {
    await auth.checkAuth()
  }

  // Forced password change gates EVERY other route until resolved
  // (ADMIN-SPA-MIGRATION.md §6). The change-password page itself is exempt so it
  // remains reachable (and avoids a redirect-to-self loop).
  if (passwordChangeRequired.value && to.name !== 'ChangePassword') {
    return { name: 'ChangePassword' }
  }

  // Guest routes: redirect authenticated users to the dashboard — except the
  // change-password page, which a signed-in admin also opens to change their
  // own password (the link in the superadmin edit dialog).
  if (to.meta.guest && auth.isAuthenticated && !to.meta.passwordChange) {
    return { name: 'Dashboard' }
  }

  // Protected routes: require authentication
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    // Only preserve safe internal redirect paths (F-04)
    const safePath = /^\/[^/]/.test(to.fullPath) ? to.fullPath : undefined
    return { name: 'Login', query: safePath ? { redirect: safePath } : {} }
  }

  // Super-admin-only routes
  if (to.meta.requiresSuperAdmin && !auth.isSuperAdmin) {
    return { name: 'Forbidden' }
  }

  return undefined
}
