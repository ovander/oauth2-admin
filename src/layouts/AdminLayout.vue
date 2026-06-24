<template>
  <div class="min-h-screen bg-gray-50 dark:bg-brand-950">
    <!-- Sidebar -->
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-brand-900 border-r border-gray-200 dark:border-brand-800',
        'transform transition-transform duration-300 ease-in-out lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      ]"
    >
      <div class="flex flex-col h-full">
        <!-- Logo -->
        <div class="flex flex-col h-16 px-6 py-3 border-b border-gray-200 dark:border-brand-800">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 gradient-brand rounded-lg flex items-center justify-center overflow-hidden">
              <img src="/socrate-logo.png" alt="Socrate" class="w-full h-full object-contain" />
            </div>
            <div>
              <span class="text-lg font-bold text-gray-900 dark:text-white">Socrate</span>
            </div>
          </div>
          <span class="text-[10px] font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-widest ml-12">
            Superadmin Portal
          </span>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <router-link
            v-for="item in mainNavigation"
            :key="item.name"
            :to="item.to"
            :class="[
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150',
              isActiveRoute(item.to)
                ? 'bg-brand-50 dark:bg-brand-800 text-brand-700 dark:text-white font-medium'
                : 'text-gray-600 dark:text-brand-300 hover:bg-gray-100 dark:hover:bg-brand-800 hover:text-gray-900 dark:hover:text-white'
            ]"
            @click="closeSidebarOnMobile"
          >
            <i :class="['pi', item.icon, 'text-lg']"></i>
            <span>{{ item.label }}</span>
          </router-link>

          <div class="pt-4 mt-4 border-t border-gray-200 dark:border-brand-800">
            <p class="px-3 mb-2 text-xs font-semibold text-gray-400 dark:text-brand-500 uppercase tracking-wider">
              Security
            </p>
            <router-link
              v-for="item in securityNavigation"
              :key="item.name"
              :to="item.to"
              :class="[
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150',
                isActiveRoute(item.to)
                  ? 'bg-brand-50 dark:bg-brand-800 text-brand-700 dark:text-white font-medium'
                  : 'text-gray-600 dark:text-brand-300 hover:bg-gray-100 dark:hover:bg-brand-800 hover:text-gray-900 dark:hover:text-white'
              ]"
              @click="closeSidebarOnMobile"
            >
              <i :class="['pi', item.icon, 'text-lg']"></i>
              <span>{{ item.label }}</span>
            </router-link>
          </div>

          <div class="pt-4 mt-4 border-t border-gray-200 dark:border-brand-800">
            <p class="px-3 mb-2 text-xs font-semibold text-gray-400 dark:text-brand-500 uppercase tracking-wider">
              System
            </p>
            <router-link
              v-for="item in systemNavigation"
              :key="item.name"
              :to="item.to"
              :class="[
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150',
                isActiveRoute(item.to)
                  ? 'bg-brand-50 dark:bg-brand-800 text-brand-700 dark:text-white font-medium'
                  : 'text-gray-600 dark:text-brand-300 hover:bg-gray-100 dark:hover:bg-brand-800 hover:text-gray-900 dark:hover:text-white'
              ]"
              @click="closeSidebarOnMobile"
            >
              <i :class="['pi', item.icon, 'text-lg']"></i>
              <span>{{ item.label }}</span>
            </router-link>
          </div>
        </nav>

        <!-- User section -->
        <div class="p-4 border-t border-gray-200 dark:border-brand-800">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-brand-100 dark:bg-brand-800 rounded-full flex items-center justify-center">
              <span class="text-sm font-semibold text-brand-700 dark:text-brand-300">
                {{ userInitials }}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                {{ authStore.user?.name || 'Admin' }}
              </p>
              <div class="flex items-center gap-1.5">
                <span class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase">
                  Superadmin
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Version badge -->
        <div class="border-t border-gray-100 dark:border-brand-800">
          <VersionBadge />
        </div>
      </div>
    </aside>

    <!-- Sidebar overlay (mobile) -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-40 bg-black/50 lg:hidden"
      @click="sidebarOpen = false"
    ></div>

    <!-- Main content -->
    <div class="lg:pl-64">
      <!-- Top header -->
      <header class="sticky top-0 z-30 h-16 bg-white/80 dark:bg-brand-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-brand-800">
        <div class="flex items-center justify-between h-full px-4 sm:px-6">
          <div class="flex items-center gap-4">
            <button
              class="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 dark:text-brand-400 dark:hover:text-white"
              @click="sidebarOpen = true"
            >
              <i class="pi pi-bars text-xl"></i>
            </button>
            <div>
              <h1 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ currentPageTitle }}
              </h1>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              class="p-2 text-gray-500 hover:text-gray-700 dark:text-brand-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-brand-800"
              v-tooltip.bottom="'Search'"
            >
              <i class="pi pi-search"></i>
            </button>

            <button
              class="p-2 text-gray-500 hover:text-gray-700 dark:text-brand-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-brand-800"
              @click="themeStore.toggleTheme()"
              v-tooltip.bottom="themeStore.isDark ? 'Light mode' : 'Dark mode'"
            >
              <i :class="['pi', themeStore.isDark ? 'pi-sun' : 'pi-moon']"></i>
            </button>

            <button
              class="p-2 text-gray-500 hover:text-gray-700 dark:text-brand-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-brand-800 relative"
              v-tooltip.bottom="'Notifications'"
            >
              <i class="pi pi-bell"></i>
              <span class="absolute top-1.5 right-1.5 w-2 h-2 bg-error-500 rounded-full"></span>
            </button>

            <Menu ref="userMenu" :model="userMenuItems" :popup="true" />
            <button
              class="flex items-center gap-2 p-1.5 pl-2 rounded-lg hover:bg-gray-100 dark:hover:bg-brand-800 transition-colors"
              @click="toggleUserMenu"
            >
              <div class="w-8 h-8 bg-brand-100 dark:bg-brand-800 rounded-full flex items-center justify-center">
                <span class="text-xs font-semibold text-brand-700 dark:text-brand-300">
                  {{ userInitials }}
                </span>
              </div>
              <i class="pi pi-chevron-down text-xs text-gray-400"></i>
            </button>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="p-4 sm:p-6 lg:p-8">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- Session timeout warning modal (F-06) -->
    <SessionTimeoutWarning
      :model-value="showTimeoutWarning"
      :seconds-left="timeoutSecondsLeft"
      @dismiss="dismissTimeoutWarning"
      @logout="authStore.logout()"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Menu from 'primevue/menu'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useSessionTimeout } from '@/composables/useSessionTimeout'
import { useVersionCheck } from '@/composables/useVersionCheck'
import SessionTimeoutWarning from '@/components/security/SessionTimeoutWarning.vue'
import VersionBadge from '@/components/VersionBadge.vue'

const route  = useRoute()
const router = useRouter()
const authStore   = useAuthStore()
const themeStore  = useThemeStore()

const sidebarOpen = ref(false)
const userMenu    = ref()

// ─── Session timeout (F-06) ───────────────────────────────────────────────────
const { showWarning: showTimeoutWarning, secondsLeft: timeoutSecondsLeft, dismissWarning: dismissTimeoutWarning } =
  useSessionTimeout(() => authStore.logout())

// ─── Version / stale-tab detection ────────────────────────────────────────────
useVersionCheck()

// ─── Navigation ───────────────────────────────────────────────────────────────
const mainNavigation = [
  { name: 'dashboard', label: 'Dashboard',    icon: 'pi-th-large', to: { name: 'Dashboard'    } },
  { name: 'apps',      label: 'Applications', icon: 'pi-box',      to: { name: 'Applications' } },
  { name: 'users',     label: 'Users',        icon: 'pi-users',    to: { name: 'Users'        } },
]

const securityNavigation = [
  { name: 'security-overview', label: 'Overview',     icon: 'pi-shield',        to: { name: 'Security'      } },
  { name: 'security-events',   label: 'Events',       icon: 'pi-history',       to: { name: 'SecurityEvents' } },
  { name: 'sessions',          label: 'Sessions',     icon: 'pi-desktop',       to: { name: 'Sessions'      } },
  { name: 'blocked-ips',       label: 'Blocked IPs',  icon: 'pi-ban',           to: { name: 'BlockedIps'    } },
  { name: 'alerts',            label: 'Alerts',       icon: 'pi-bell',          to: { name: 'Alerts'        } },
  { name: 'reports',           label: 'Reports',      icon: 'pi-file',          to: { name: 'Reports'       } },
]

const systemNavigation = [
  { name: 'logs',     label: 'Audit Logs', icon: 'pi-list', to: { name: 'AdminLogs' } },
  { name: 'settings', label: 'Settings',   icon: 'pi-cog',  to: { name: 'Settings'  } },
]

const userMenuItems = computed(() => [
  {
    label: authStore.user?.name || 'Admin',
    items: [
      { label: 'My Profile', icon: 'pi pi-user',     command: () => router.push({ name: 'Profile'   }) },
      { label: 'Settings',   icon: 'pi pi-cog',      command: () => router.push({ name: 'Settings'  }) },
      { separator: true },
      { label: 'Logout',     icon: 'pi pi-sign-out', command: () => authStore.logout() },
    ],
  },
])

const currentPageTitle = computed(() => (route.meta.title as string) || 'Dashboard')

const userInitials = computed(() => {
  const name  = authStore.user?.name || 'A'
  const parts = name.split(' ')
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.substring(0, 2).toUpperCase()
})

function isActiveRoute(to: any): boolean {
  if (to.name === route.name) return true
  const resolved = router.resolve(to)
  return route.path.startsWith(resolved.path) && resolved.path !== '/'
}

function closeSidebarOnMobile() {
  if (window.innerWidth < 1024) sidebarOpen.value = false
}

function toggleUserMenu(event: Event) {
  userMenu.value.toggle(event)
}
</script>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.page-enter-from { opacity: 0; transform: translateY(8px);  }
.page-leave-to   { opacity: 0; transform: translateY(-8px); }
</style>
