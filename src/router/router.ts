import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { passwordChangeRequired } from '@/services/adminGuards'

// Layouts
import AuthLayout  from '@/layouts/AuthLayout.vue'
import AdminLayout from '@/layouts/AdminLayout.vue'

const routes: RouteRecordRaw[] = [
  // ── Auth routes ────────────────────────────────────────────────────────────
  {
    path:      '/auth',
    component: AuthLayout,
    meta:      { guest: true },
    children:  [
      { path: 'login',          name: 'Login',          component: () => import('@/views/auth/LoginView.vue'),          meta: { title: 'Login' } },
      { path: 'change-password',name: 'ChangePassword', component: () => import('@/views/auth/ChangePasswordView.vue'), meta: { title: 'Change Password', passwordChange: true } },
      { path: 'forgot-password',name: 'ForgotPassword', component: () => import('@/views/auth/ForgotPasswordView.vue'), meta: { title: 'Forgot Password' } },
      { path: 'reset-password', name: 'ResetPassword',  component: () => import('@/views/auth/ResetPasswordView.vue'),  meta: { title: 'Reset Password' } },
    ],
  },

  // ── Admin routes ───────────────────────────────────────────────────────────
  {
    path:      '/',
    component: AdminLayout,
    meta:      { requiresAuth: true },
    children:  [
      { path: '',           name: 'Dashboard',       component: () => import('@/views/dashboard/DashboardView.vue'),           meta: { title: 'Dashboard'         } },
      { path: 'apps',       name: 'Applications',    component: () => import('@/views/applications/ApplicationListView.vue'),  meta: { title: 'Applications'      } },
      { path: 'apps/new',   name: 'CreateApplication',component: () => import('@/views/applications/CreateApplicationView.vue'),meta: { title: 'Create Application'} },
      { path: 'apps/:id',   name: 'ApplicationDetail',component: () => import('@/views/applications/ApplicationDetailView.vue'),props: true, meta: { title: 'Application Details' } },
      { path: 'users',      name: 'Users',           component: () => import('@/views/users/UserListView.vue'),                meta: { title: 'Users',           requiresSuperAdmin: true } },
      { path: 'users/:id',  name: 'UserDetail',      component: () => import('@/views/users/UserDetailView.vue'),             props: true, meta: { title: 'User Details'     } },
      { path: 'security',   name: 'Security',        component: () => import('@/views/security/SecurityDashboardView.vue'),   meta: { title: 'Security'          } },
      { path: 'security/events', name: 'SecurityEvents', component: () => import('@/views/security/SecurityEventsView.vue'), meta: { title: 'Security Events'   } },
      { path: 'security/sessions', name: 'Sessions', component: () => import('@/views/security/SessionsView.vue'), meta: { title: 'Active Sessions' } },
      { path: 'security/blocked-ips', name: 'BlockedIps', component: () => import('@/views/security/BlockedIpsView.vue'), meta: { title: 'Blocked IPs', requiresSuperAdmin: true } },
      { path: 'security/alerts', name: 'Alerts', component: () => import('@/views/security/AlertsView.vue'), meta: { title: 'Alerts', requiresSuperAdmin: true } },
      { path: 'security/reports', name: 'Reports', component: () => import('@/views/security/ReportsView.vue'), meta: { title: 'Security Reports', requiresSuperAdmin: true } },
      { path: 'logs',       name: 'AdminLogs',       component: () => import('@/views/logs/AdminLogsView.vue'),               meta: { title: 'Admin Logs',      requiresSuperAdmin: true } },
      { path: 'settings',   name: 'Settings',        component: () => import('@/views/settings/SettingsView.vue'),            meta: { title: 'Settings'          } },
      { path: 'settings/profile', name: 'Profile',   component: () => import('@/views/settings/ProfileView.vue'),            meta: { title: 'My Profile'        } },
    ],
  },

  // ── Error pages ────────────────────────────────────────────────────────────
  { path: '/403', name: 'Forbidden', component: () => import('@/views/errors/ForbiddenView.vue'), meta: { title: 'Access Denied'   } },
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('@/views/errors/NotFoundView.vue'), meta: { title: 'Page Not Found' } },
]

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

// ─── Navigation guards ────────────────────────────────────────────────────────
router.beforeEach(async (to, _from, next) => {
  // Update document title
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} | Socrate` : 'Socrate — Superadmin Portal'

  const authStore = useAuthStore()

  // Re-hydrate auth state on every cold navigation. This asks the BFF whether
  // the session cookie is valid (`GET /bff/session`) and, as a side effect,
  // loads the CSRF token needed by every state-changing request — including the
  // change-password form below.
  if (!authStore.isAuthenticated) {
    await authStore.checkAuth()
  }

  // Forced password change gates EVERY other route until resolved
  // (ADMIN-SPA-MIGRATION.md §6). The change-password page itself is exempt so it
  // remains reachable (and avoids a redirect-to-self loop).
  if (passwordChangeRequired.value && to.name !== 'ChangePassword') {
    return next({ name: 'ChangePassword' })
  }

  // Guest routes: redirect authenticated users to dashboard
  if (to.meta.guest && authStore.isAuthenticated) {
    return next({ name: 'Dashboard' })
  }

  // Protected routes: require authentication
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    // Only preserve safe internal redirect paths (F-04)
    const safePath = /^\/[^/]/.test(to.fullPath) ? to.fullPath : undefined
    return next({ name: 'Login', query: safePath ? { redirect: safePath } : {} })
  }

  // Super-admin-only routes
  if (to.meta.requiresSuperAdmin && !authStore.isSuperAdmin) {
    return next({ name: 'Forbidden' })
  }

  next()
})

export default router
