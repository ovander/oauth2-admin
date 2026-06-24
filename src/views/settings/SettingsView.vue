<template>
  <div>
    <PageHeader
      title="Settings"
      subtitle="System configuration and server information"
    />

    <LoadingState v-if="loading" message="Loading settings..." />

    <div v-else-if="loadError" class="card p-6 border-error-200 dark:border-error-900/50">
      <div class="flex items-center gap-3 text-error-600 dark:text-error-400">
        <i class="pi pi-exclamation-triangle text-2xl"></i>
        <div>
          <p class="font-semibold">Unable to load settings</p>
          <p class="text-sm mt-1 text-gray-500 dark:text-brand-400">{{ loadError }}</p>
        </div>
      </div>
      <Button label="Retry" icon="pi pi-refresh" class="btn-secondary mt-4" @click="loadSettings" />
    </div>

    <template v-else>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main Settings -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Server Information -->
          <div class="card p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Server Information
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
                  Issuer URL
                </label>
                <div class="flex gap-2">
                  <InputText
                    :value="config?.issuer_url"
                    readonly
                    class="flex-1 text-sm bg-gray-50 dark:bg-brand-800"
                  />
                  <Button
                    icon="pi pi-copy"
                    class="p-button-outlined p-button-sm"
                    @click="copy(config?.issuer_url || '', 'Copied')"
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
                  Environment
                </label>
                <StatusBadge
                  :status="getEnvStatus(config?.environment)"
                  :label="config?.environment || 'unknown'"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
                  Server Version
                </label>
                <p class="text-gray-900 dark:text-white font-mono">
                  {{ config?.version || '-' }}
                </p>
              </div>
            </div>
          </div>

          <!-- Token Configuration -->
          <div class="card p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Token Configuration
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
                  Default Access Token TTL
                </label>
                <p class="text-gray-900 dark:text-white">
                  {{ formatDuration(config?.access_token_ttl || 3600) }}
                </p>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
                  Default Refresh Token TTL
                </label>
                <p class="text-gray-900 dark:text-white">
                  {{ formatDuration(config?.refresh_token_ttl || 604800) }}
                </p>
              </div>
            </div>
          </div>

          <!-- Rate Limiting -->
          <div class="card p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Rate Limiting
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
                  Requests per Window
                </label>
                <p class="text-gray-900 dark:text-white">
                  {{ config?.rate_limit_requests || 100 }} requests
                </p>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
                  Window Duration
                </label>
                <p class="text-gray-900 dark:text-white">
                  {{ formatDuration(config?.rate_limit_window || 60) }}
                </p>
              </div>
            </div>
          </div>

          <!-- Features -->
          <div class="card p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Features
            </h3>

            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <i
                    :class="[
                      'pi',
                      config?.features?.mfa_enabled ? 'pi-check-circle text-success-500' : 'pi-times-circle text-gray-400'
                    ]"
                  ></i>
                  <span class="text-gray-700 dark:text-gray-300">Multi-Factor Authentication</span>
                </div>
                <StatusBadge
                  :status="config?.features?.mfa_enabled ? 'success' : 'neutral'"
                  :label="config?.features?.mfa_enabled ? 'Enabled' : 'Disabled'"
                />
              </div>

              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <i
                    :class="[
                      'pi',
                      config?.features?.password_policy_enabled ? 'pi-check-circle text-success-500' : 'pi-times-circle text-gray-400'
                    ]"
                  ></i>
                  <span class="text-gray-700 dark:text-gray-300">Password Policy</span>
                </div>
                <StatusBadge
                  :status="config?.features?.password_policy_enabled ? 'success' : 'neutral'"
                  :label="config?.features?.password_policy_enabled ? 'Enabled' : 'Disabled'"
                />
              </div>

              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <i
                    :class="[
                      'pi',
                      config?.features?.audit_logging_enabled ? 'pi-check-circle text-success-500' : 'pi-times-circle text-gray-400'
                    ]"
                  ></i>
                  <span class="text-gray-700 dark:text-gray-300">Audit Logging</span>
                </div>
                <StatusBadge
                  :status="config?.features?.audit_logging_enabled ? 'success' : 'neutral'"
                  :label="config?.features?.audit_logging_enabled ? 'Enabled' : 'Disabled'"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-6">
          <!-- Connection Tests -->
          <div class="card p-6">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Connection Tests
            </h3>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-700 dark:text-gray-300">Database</span>
                <div class="flex items-center gap-2">
                  <StatusBadge
                    :status="dbStatus.status === 'ok' ? 'success' : 'error'"
                    :label="dbStatus.status === 'ok' ? 'Connected' : 'Error'"
                    :show-dot="true"
                  />
                  <span v-if="dbStatus.latency_ms" class="text-xs text-gray-500">
                    {{ dbStatus.latency_ms }}ms
                  </span>
                </div>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-700 dark:text-gray-300">Cache</span>
                <div class="flex items-center gap-2">
                  <StatusBadge
                    :status="cacheStatus.status === 'ok' ? 'success' : 'error'"
                    :label="cacheStatus.status === 'ok' ? 'Connected' : 'Error'"
                    :show-dot="true"
                  />
                  <span v-if="cacheStatus.latency_ms" class="text-xs text-gray-500">
                    {{ cacheStatus.latency_ms }}ms
                  </span>
                </div>
              </div>

              <Button
                label="Test Connections"
                icon="pi pi-refresh"
                class="w-full p-button-outlined"
                :loading="testingConnections"
                @click="testConnections"
              />
            </div>
          </div>

          <!-- Quick Links -->
          <div class="card p-6">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Quick Links
            </h3>

            <div class="space-y-2">
              <router-link
                :to="{ name: 'Profile' }"
                class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-brand-800 transition-colors"
              >
                <i class="pi pi-user text-brand-600 dark:text-brand-400"></i>
                <span class="text-sm text-gray-700 dark:text-gray-300">My Profile</span>
                <i class="pi pi-chevron-right text-gray-300 dark:text-brand-600 ml-auto text-xs"></i>
              </router-link>

              <router-link
                :to="{ name: 'Security' }"
                class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-brand-800 transition-colors"
              >
                <i class="pi pi-shield text-brand-600 dark:text-brand-400"></i>
                <span class="text-sm text-gray-700 dark:text-gray-300">Security Settings</span>
                <i class="pi pi-chevron-right text-gray-300 dark:text-brand-600 ml-auto text-xs"></i>
              </router-link>

              <router-link
                :to="{ name: 'AdminLogs' }"
                class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-brand-800 transition-colors"
              >
                <i class="pi pi-list text-brand-600 dark:text-brand-400"></i>
                <span class="text-sm text-gray-700 dark:text-gray-300">Audit Logs</span>
                <i class="pi pi-chevron-right text-gray-300 dark:text-brand-600 ml-auto text-xs"></i>
              </router-link>
            </div>
          </div>

          <!-- Theme -->
          <div class="card p-6">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Appearance
            </h3>

            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-700 dark:text-gray-300">Dark Mode</span>
              <ToggleSwitch v-model="isDark" @change="themeStore.toggleTheme()" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'
import PageHeader from '@/components/ui/PageHeader.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useThemeStore } from '@/stores/themeStore'
import { useClipboard } from '@/composables/useClipboard'
import * as settingsService from '@/services/settingsService'
import { deverror } from '@/utils/devlog'
import type { ServerConfig } from '@/services/settingsService'
import { formatDuration } from '@/utils/formatDate'

const themeStore = useThemeStore()
const { copy } = useClipboard()

// State
const loading    = ref(true)
const loadError  = ref<string | null>(null)
const config     = ref<ServerConfig | null>(null)
const testingConnections = ref(false)
const dbStatus = ref({ status: 'ok', latency_ms: 0 })
const cacheStatus = ref({ status: 'ok', latency_ms: 0 })

const isDark = computed({
  get: () => themeStore.isDark,
  set: () => {} // Handled by toggle
})

// Methods
async function loadSettings() {
  loading.value = true

  try {
    config.value = await settingsService.getServerConfig()
    await testConnections()
  } catch (error) {
    deverror('Failed to load settings', error)
    loadError.value = 'Unable to load server configuration. Please try again.'
  } finally {
    loading.value = false
  }
}

async function testConnections() {
  testingConnections.value = true

  try {
    const [db, cache] = await Promise.all([
      settingsService.testDatabaseConnection(),
      settingsService.testCacheConnection()
    ])

    dbStatus.value = db
    cacheStatus.value = cache
  } catch {
    dbStatus.value    = { status: 'error', latency_ms: 0 }
    cacheStatus.value = { status: 'error', latency_ms: 0 }
  } finally {
    testingConnections.value = false
  }
}

function getEnvStatus(env?: string): 'success' | 'warning' | 'error' {
  const map: Record<string, 'success' | 'warning' | 'error'> = {
    production: 'success',
    staging: 'warning',
    development: 'error'
  }
  return map[env || ''] || 'neutral'
}

onMounted(loadSettings)
</script>
