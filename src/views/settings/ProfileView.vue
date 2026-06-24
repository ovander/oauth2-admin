<template>
  <div>
    <PageHeader
      title="My Profile"
      subtitle="Manage your account settings and security"
      :breadcrumbs="[{ label: 'Settings', to: { name: 'Settings' } }]"
    />

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main Content -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Profile Info -->
        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Profile Information
          </h3>

          <form @submit.prevent="updateProfile" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name
                </label>
                <InputText
                  v-model="profileForm.name"
                  class="w-full"
                  :class="{ 'p-invalid': profileErrors.name }"
                />
                <small v-if="profileErrors.name" class="text-error-600 text-xs">
                  {{ profileErrors.name }}
                </small>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Address
                </label>
                <InputText
                  v-model="profileForm.email"
                  type="email"
                  class="w-full"
                  :class="{ 'p-invalid': profileErrors.email }"
                />
                <small v-if="profileErrors.email" class="text-error-600 text-xs">
                  {{ profileErrors.email }}
                </small>
              </div>
            </div>

            <div class="flex items-center gap-3 pt-2">
              <Button
                type="submit"
                label="Save Changes"
                icon="pi pi-check"
                class="btn-primary"
                :loading="savingProfile"
              />
            </div>
          </form>
        </div>

        <!-- Password -->
        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Password
          </h3>

          <p class="text-sm text-gray-500 dark:text-brand-400 mb-4">
            For your security, admin passwords are changed through an emailed
            reset link rather than in-app. We'll send a link to
            <span class="font-medium text-gray-700 dark:text-gray-300">{{ authStore.user?.email }}</span>.
          </p>

          <Button
            label="Send password reset link"
            icon="pi pi-envelope"
            class="btn-primary"
            :loading="sendingReset"
            @click="sendPasswordReset"
          />
        </div>

        <!-- Active Sessions -->
        <div class="card">
          <div class="px-6 py-4 border-b border-gray-100 dark:border-brand-800">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Active Sessions
            </h3>
          </div>

          <div class="divide-y divide-gray-100 dark:divide-brand-800">
            <div
              v-for="session in sessions"
              :key="session.id"
              class="px-6 py-4 flex items-center justify-between"
            >
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-brand-800">
                  <i :class="['pi text-lg text-gray-500', getDeviceIcon(session.user_agent)]"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium text-gray-900 dark:text-white">
                      {{ getDeviceName(session.user_agent) }}
                    </p>
                    <span class="text-xs text-gray-400 dark:text-brand-500">{{ session.app_name }}</span>
                  </div>
                  <p class="text-xs text-gray-500 dark:text-brand-400">
                    {{ session.ip_address }} · Last active {{ formatRelativeTime(session.last_activity) }}
                  </p>
                </div>
              </div>
            </div>

            <div v-if="sessions.length === 0" class="px-6 py-12 text-center">
              <p class="text-gray-500 dark:text-brand-400">No active sessions</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Account Info -->
        <div class="card p-6">
          <div class="text-center">
            <div class="w-20 h-20 mx-auto bg-brand-100 dark:bg-brand-800 rounded-full flex items-center justify-center mb-4">
              <span class="text-2xl font-bold text-brand-700 dark:text-brand-300">
                {{ userInitials }}
              </span>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ authStore.user?.name }}
            </h3>
            <p class="text-sm text-gray-500 dark:text-brand-400">
              {{ authStore.user?.email }}
            </p>
            <StatusBadge
              class="mt-2"
              :status="authStore.user?.email_verified ? 'success' : 'warning'"
              :label="authStore.user?.email_verified ? 'Verified' : 'Pending Verification'"
            />
          </div>
        </div>

        <!-- Role & Access -->
        <div class="card p-6">
          <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4">
            Role & Access
          </h3>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-500 dark:text-brand-400">Role</span>
              <StatusBadge
                :status="getRoleStatus(authStore.user?.role)"
                :label="formatRole(authStore.user?.role)"
              />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-500 dark:text-brand-400">Member Since</span>
              <span class="text-sm text-gray-900 dark:text-white">
                {{ formatDate(authStore.user?.created_at) }}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-500 dark:text-brand-400">Last Login</span>
              <span class="text-sm text-gray-900 dark:text-white">
                {{ formatRelativeTime(authStore.user?.last_login_at) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="card p-6 border-error-200 dark:border-error-900/50">
          <h3 class="text-base font-semibold text-error-600 dark:text-error-400 mb-4">
            Danger Zone
          </h3>
          <p class="text-sm text-gray-500 dark:text-brand-400 mb-4">
            Logging out will end your current session.
          </p>
          <Button
            label="Log Out"
            icon="pi pi-sign-out"
            class="w-full p-button-outlined p-button-danger"
            @click="authStore.logout()"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/composables/useToast'
import * as authService from '@/services/authService'
import { getSessions } from '@/services/monitoringService'
import { formatDate, formatRelativeTime } from '@/utils/formatDate'
import { roleLabel } from '@/utils/roles'
import type { AdminSession } from '@/types/monitoring'

const authStore = useAuthStore()
const toast = useToast()

// State
const savingProfile = ref(false)
const sendingReset = ref(false)
const sessions = ref<AdminSession[]>([])

// Forms
const profileForm = reactive({
  name: authStore.user?.name || '',
  email: authStore.user?.email || ''
})

const profileErrors = reactive({
  name: '',
  email: ''
})

// Computed
const userInitials = computed(() => {
  const name = authStore.user?.name || 'A'
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
})

// Methods
async function updateProfile() {
  profileErrors.name = ''
  profileErrors.email = ''

  if (!profileForm.name.trim()) {
    profileErrors.name = 'Name is required'
    return
  }

  if (!profileForm.email.trim()) {
    profileErrors.email = 'Email is required'
    return
  }

  savingProfile.value = true

  try {
    await authStore.updateProfile({
      name: profileForm.name,
      email: profileForm.email
    })
    toast.success('Profile updated')
  } catch (error: any) {
    toast.error('Failed to update profile', error.response?.data?.message)
  } finally {
    savingProfile.value = false
  }
}

async function sendPasswordReset() {
  const email = authStore.user?.email
  if (!email) {
    toast.error('No email on file for your account')
    return
  }

  sendingReset.value = true
  try {
    await authService.requestPasswordReset(email)
    toast.success('Password reset link sent', `Check ${email} for the link.`)
  } catch {
    // Avoid leaking whether the address exists — report success-shaped feedback.
    toast.success('Password reset link sent', `If ${email} is registered, a link is on its way.`)
  } finally {
    sendingReset.value = false
  }
}

async function loadSessions() {
  const userId = authStore.user?.id
  if (!userId) return
  try {
    // Show only THIS admin's own sessions (server-wide sessions live in the
    // Security → Sessions view).
    const res = await getSessions({ user_id: userId })
    sessions.value = res.sessions
  } catch {
    sessions.value = []
    toast.error('Unable to load active sessions')
  }
}

function getDeviceIcon(userAgent: string): string {
  if (userAgent.includes('iPhone') || userAgent.includes('Android')) {
    return 'pi-mobile'
  }
  if (userAgent.includes('iPad') || userAgent.includes('Tablet')) {
    return 'pi-tablet'
  }
  return 'pi-desktop'
}

function getDeviceName(userAgent: string): string {
  if (userAgent.includes('Chrome')) return 'Chrome'
  if (userAgent.includes('Firefox')) return 'Firefox'
  if (userAgent.includes('Safari')) return 'Safari'
  if (userAgent.includes('Edge')) return 'Edge'
  return 'Unknown Browser'
}

function getRoleStatus(role?: string): 'success' | 'info' | 'warning' {
  const map: Record<string, 'success' | 'info' | 'warning'> = {
    super_admin: 'success',
    app_admin: 'info',
    app_manager: 'info',
    viewer: 'warning'
  }
  return map[role || ''] || 'info'
}

function formatRole(role?: string): string {
  return roleLabel(role)
}

onMounted(loadSessions)
</script>
