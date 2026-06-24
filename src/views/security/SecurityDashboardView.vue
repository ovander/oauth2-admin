<template>
  <div>
    <PageHeader
      title="Security"
      subtitle="Monitor security events and system health"
    >
      <template #actions>
        <Button
          label="View All Events"
          icon="pi pi-list"
          class="btn-secondary"
          @click="$router.push({ name: 'SecurityEvents' })"
        />
      </template>
    </PageHeader>

    <LoadingState v-if="loading" message="Loading security data..." />

    <!-- Error state — never show fabricated data (F-11) -->
    <div v-else-if="loadError" class="card p-6 border-error-200 dark:border-error-900/50">
      <div class="flex items-center gap-3 text-error-600 dark:text-error-400">
        <i class="pi pi-exclamation-triangle text-2xl"></i>
        <div>
          <p class="font-semibold">Unable to load security data</p>
          <p class="text-sm mt-1 text-gray-500 dark:text-brand-400">{{ loadError }}</p>
        </div>
      </div>
      <Button
        label="Retry"
        icon="pi pi-refresh"
        class="btn-secondary mt-4"
        @click="loadSecurityData"
      />
    </div>

    <template v-else>
      <!-- Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon="pi-sign-in"              label="Events Today"       :value="stats?.summary.total_events    ?? 0" color="brand"   />
        <StatCard icon="pi-times-circle"         label="Failed Logins"      :value="stats?.summary.error_events    ?? 0" color="error"   />
        <StatCard icon="pi-lock"                 label="Locked Accounts"    :value="stats?.locked_accounts?.length ?? 0" color="warning" />
        <StatCard icon="pi-exclamation-triangle" label="Suspicious IPs"     :value="stats?.suspicious_ips?.length  ?? 0" color="error"   />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Recent Security Events -->
        <div class="lg:col-span-2">
          <div class="card">
            <div class="px-6 py-4 border-b border-gray-100 dark:border-brand-800 flex items-center justify-between">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Recent Security Events</h3>
              <router-link :to="{ name: 'SecurityEvents' }" class="text-sm text-brand-600 dark:text-brand-400 hover:underline">
                View all →
              </router-link>
            </div>
            <div class="divide-y divide-gray-100 dark:divide-brand-800">
              <div
                v-for="event in recentEvents"
                :key="event.id"
                class="px-6 py-4 hover:bg-gray-50 dark:hover:bg-brand-800/50 transition-colors"
              >
                <div class="flex items-start gap-3">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0" :class="getSeverityBg(event.severity)">
                    <i :class="['pi text-sm', getEventIcon(event.event_type), getSeverityColor(event.severity)]"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white">{{ getEventLabel(event.event_type) }}</p>
                        <p class="text-xs text-gray-500 dark:text-brand-400 mt-0.5">{{ event.user_email || event.ip_address }}</p>
                      </div>
                      <StatusBadge :status="getSeverityStatus(event.severity)" :label="event.severity" />
                    </div>
                    <p class="text-xs text-gray-400 dark:text-brand-500 mt-1">{{ formatRelativeTime(event.created_at) }}</p>
                  </div>
                </div>
              </div>
              <div v-if="recentEvents.length === 0" class="px-6 py-12 text-center">
                <i class="pi pi-shield text-4xl text-gray-300 dark:text-brand-700 mb-3"></i>
                <p class="text-gray-500 dark:text-brand-400">No security events</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="space-y-6">
          <!-- Active Sessions -->
          <div class="card p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-semibold text-gray-900 dark:text-white">Unique Attackers</h3>
              <span class="text-2xl font-bold text-brand-600 dark:text-brand-400">{{ stats?.summary.unique_attackers ?? 0 }}</span>
            </div>
            <p class="text-sm text-gray-500 dark:text-brand-400">Distinct IPs responsible for failed or suspicious events in the current period</p>
          </div>

          <!-- Live Security Checklist (F-18) — driven by real server config -->
          <div class="card p-6">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4">Security Checklist</h3>
            <div v-if="checklistLoading" class="flex items-center gap-2 text-gray-400">
              <i class="pi pi-spin pi-spinner"></i>
              <span class="text-sm">Loading…</span>
            </div>
            <div v-else-if="checklistError" class="text-sm text-error-600 dark:text-error-400">
              <i class="pi pi-exclamation-triangle mr-1"></i>
              Unable to verify feature status
            </div>
            <div v-else class="space-y-3">
              <div v-for="item in checklistItems" :key="item.label" class="flex items-center gap-3">
                <i :class="['pi', item.enabled ? 'pi-check-circle text-success-500' : 'pi-times-circle text-error-400']"></i>
                <span class="text-sm text-gray-700 dark:text-gray-300">{{ item.label }}</span>
                <span v-if="!item.enabled" class="ml-auto text-xs text-error-500 font-medium">Disabled</span>
              </div>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="card p-6">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
            <div class="space-y-2">
              <Button
                label="View Locked Accounts"
                icon="pi pi-lock"
                class="w-full p-button-outlined"
                @click="$router.push({ name: 'Users', query: { status: 'locked' } })"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Button from 'primevue/button'
import PageHeader  from '@/components/ui/PageHeader.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import StatCard    from '@/components/dashboard/StatCard.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import * as securityService from '@/services/securityService'
import * as settingsService from '@/services/settingsService'
import { formatRelativeTime } from '@/utils/formatDate'
import { deverror } from '@/utils/devlog'
import type { SecurityEvent, ThreatMetricsResponse } from '@/types/security'

// ─── State ────────────────────────────────────────────────────────────────────
const loading             = ref(true)
const loadError           = ref<string | null>(null)
const stats               = ref<ThreatMetricsResponse | null>(null)
const recentEvents        = ref<SecurityEvent[]>([])

// Checklist (F-18) — driven by GET /api/admin/settings/config
const checklistLoading = ref(false)
const checklistError   = ref(false)
const checklistItems   = ref<Array<{ label: string; enabled: boolean }>>([
  { label: 'Rate limiting enabled', enabled: true }, // server-enforced, always on
  { label: 'PKCE enforcement',      enabled: true }, // server-enforced, always on
])

// ─── Data loading ─────────────────────────────────────────────────────────────
async function loadSecurityData() {
  loading.value   = true
  loadError.value = null

  try {
    const [statsData, eventsData] = await Promise.all([
      securityService.getSecurityStats(),
      securityService.getRecentSecurityEvents(10),
    ])
    stats.value        = statsData
    recentEvents.value = eventsData
  } catch (err) {
    deverror('Failed to load security data', err)
    loadError.value = 'Could not contact the security API. Please check your connection and try again.'
  } finally {
    loading.value = false
  }
}

async function loadChecklist() {
  checklistLoading.value = true
  checklistError.value   = false
  try {
    const config = await settingsService.getServerConfig()
    checklistItems.value = [
      { label: 'Rate limiting enabled',   enabled: true },
      { label: 'PKCE enforcement',        enabled: true },
      { label: 'Audit logging active',    enabled: config.features.audit_logging_enabled },
      { label: 'Password policy enabled', enabled: config.features.password_policy_enabled },
      { label: 'MFA available',           enabled: config.features.mfa_enabled },
    ]
  } catch (err) {
    deverror('Failed to load security checklist', err)
    checklistError.value = true
  } finally {
    checklistLoading.value = false
  }
}

// ─── Display helpers ──────────────────────────────────────────────────────────
function getEventLabel(type: string): string { return securityService.securityEventLabels[type] || type }

function getEventIcon(type: string): string {
  const icons: Record<string, string> = {
    login_success: 'pi-sign-in', login_failed: 'pi-times', logout: 'pi-sign-out',
    account_locked: 'pi-lock', account_unlocked: 'pi-unlock', password_changed: 'pi-key',
    brute_force_detected: 'pi-exclamation-triangle', suspicious_activity: 'pi-exclamation-circle',
  }
  return icons[type] || 'pi-info-circle'
}

function getSeverityBg(s: string):     string { return ({ info: 'bg-brand-100 dark:bg-brand-800', warning: 'bg-warning-100 dark:bg-warning-900/30', error: 'bg-error-100 dark:bg-error-900/30', critical: 'bg-error-100 dark:bg-error-900/30' } as Record<string, string>)[s] || 'bg-brand-100 dark:bg-brand-800' }
function getSeverityColor(s: string):  string { return ({ info: 'text-brand-600 dark:text-brand-400', warning: 'text-warning-600 dark:text-warning-400', error: 'text-error-600 dark:text-error-400', critical: 'text-error-600 dark:text-error-400' } as Record<string, string>)[s] || 'text-brand-600 dark:text-brand-400' }
function getSeverityStatus(s: string): 'info' | 'warning' | 'error' { return ({ info: 'info', warning: 'warning', error: 'error', critical: 'error' } as Record<string, 'info' | 'warning' | 'error'>)[s] || 'info' }

onMounted(() => {
  loadSecurityData()
  loadChecklist()
})
</script>
