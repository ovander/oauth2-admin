<template>
  <div>
    <PageHeader
      title="Blocked IPs"
      subtitle="Block abusive IPs and inspect address reputation"
      :breadcrumbs="[{ label: 'Security', to: { name: 'Security' } }]"
    >
      <template #actions>
        <Button
          label="Block IP"
          icon="pi pi-ban"
          class="btn-primary"
          @click="openBlockDialog"
        />
      </template>
    </PageHeader>

    <!-- IP Reputation Lookup -->
    <div class="card p-6 mb-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">
        IP Reputation Lookup
      </h2>
      <p class="text-sm text-gray-500 dark:text-brand-400 mb-4">
        Look up the risk profile and recent activity for an IP address.
      </p>

      <div class="flex flex-col sm:flex-row gap-3 sm:items-center">
        <InputText
          v-model="lookupIp"
          placeholder="e.g. 203.0.113.42"
          class="w-full sm:max-w-xs font-mono"
          @keyup.enter="checkReputation"
        />
        <Button
          label="Check"
          icon="pi pi-search"
          class="btn-secondary"
          :loading="lookupLoading"
          :disabled="!lookupIp.trim()"
          @click="checkReputation"
        />
      </div>

      <!-- Lookup result -->
      <div v-if="reputation" class="mt-6 border-t border-gray-100 dark:border-brand-800 pt-6">
        <div class="flex flex-wrap items-center gap-3 mb-5">
          <span class="font-mono text-sm text-gray-900 dark:text-white">
            {{ reputation.ip_address }}
          </span>
          <StatusBadge
            :status="riskStatus(reputation.risk_score)"
            :label="`Risk ${reputation.risk_score}/100`"
          />
          <StatusBadge
            :status="reputation.is_blocked ? 'error' : 'success'"
            :label="reputation.is_blocked ? 'Blocked' : 'Not blocked'"
          />
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div class="rounded-lg bg-gray-50 dark:bg-brand-800 p-3">
            <p class="text-xs text-gray-500 dark:text-brand-400">Events (24h)</p>
            <p class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ reputation.events_24h }}
            </p>
          </div>
          <div class="rounded-lg bg-gray-50 dark:bg-brand-800 p-3">
            <p class="text-xs text-gray-500 dark:text-brand-400">Events (7d)</p>
            <p class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ reputation.events_7d }}
            </p>
          </div>
          <div class="rounded-lg bg-gray-50 dark:bg-brand-800 p-3">
            <p class="text-xs text-gray-500 dark:text-brand-400">Failed logins (24h)</p>
            <p class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ reputation.failed_logins_24h }}
            </p>
          </div>
          <div class="rounded-lg bg-gray-50 dark:bg-brand-800 p-3">
            <p class="text-xs text-gray-500 dark:text-brand-400">Users targeted</p>
            <p class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ reputation.unique_users_targeted }}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
              First Seen
            </label>
            <p class="text-sm text-gray-900 dark:text-white">
              {{ reputation.first_seen ? formatDateTime(reputation.first_seen) : '—' }}
            </p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
              Last Seen
            </label>
            <p class="text-sm text-gray-900 dark:text-white">
              {{ reputation.last_seen ? formatDateTime(reputation.last_seen) : '—' }}
            </p>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-2">
            Recent Events
          </label>
          <DataTable
            v-if="reputation.recent_events.length > 0"
            :value="reputation.recent_events"
            responsiveLayout="scroll"
            class="p-datatable-sm"
          >
            <Column field="event_type" header="Event" style="min-width: 180px">
              <template #body="{ data }">
                <span class="text-sm text-gray-900 dark:text-white">
                  {{ data.event_type }}
                </span>
              </template>
            </Column>
            <Column field="severity" header="Severity" style="width: 120px">
              <template #body="{ data }">
                <StatusBadge :status="severityStatus(data.severity)" :label="data.severity" />
              </template>
            </Column>
            <Column field="created_at" header="Time" style="width: 200px">
              <template #body="{ data }">
                <div>
                  <p class="text-sm text-gray-900 dark:text-white">
                    {{ formatDateTime(data.created_at) }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-brand-400">
                    {{ formatRelativeTime(data.created_at) }}
                  </p>
                </div>
              </template>
            </Column>
          </DataTable>
          <p v-else class="text-sm text-gray-500 dark:text-brand-400">
            No recent events recorded for this address.
          </p>
        </div>
      </div>

      <p
        v-else-if="lookupChecked && !lookupLoading"
        class="mt-6 text-sm text-gray-500 dark:text-brand-400"
      >
        No reputation data found for that IP address.
      </p>
    </div>

    <!-- Blocked IPs Table -->
    <div class="card overflow-hidden">
      <DataTable
        :value="blockedIps"
        :loading="loading"
        :lazy="false"
        :paginator="blockedIps.length > 10"
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        responsiveLayout="scroll"
        class="p-datatable-sm"
      >
        <Column field="ip_address" header="IP Address" style="min-width: 160px">
          <template #body="{ data }">
            <span class="text-sm font-mono text-gray-900 dark:text-white">
              {{ data.ip_address }}
            </span>
          </template>
        </Column>

        <Column field="reason" header="Reason" style="min-width: 200px">
          <template #body="{ data }">
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {{ data.reason || '—' }}
            </span>
          </template>
        </Column>

        <Column field="blocked_by_email" header="Blocked By" style="min-width: 180px">
          <template #body="{ data }">
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {{ data.blocked_by_email || '—' }}
            </span>
          </template>
        </Column>

        <Column field="blocked_at" header="Blocked At" style="width: 160px">
          <template #body="{ data }">
            <span class="text-sm text-gray-900 dark:text-white">
              {{ formatDate(data.blocked_at) }}
            </span>
          </template>
        </Column>

        <Column header="Expiry" style="width: 200px">
          <template #body="{ data }">
            <StatusBadge v-if="data.permanent" status="error" label="Permanent" />
            <span v-else class="text-sm text-gray-700 dark:text-gray-300">
              {{ data.expires_at ? formatDateTime(data.expires_at) : '—' }}
            </span>
          </template>
        </Column>

        <Column header="" style="width: 60px">
          <template #body="{ data }">
            <Button
              icon="pi pi-times"
              class="p-button-text p-button-danger p-button-sm"
              v-tooltip.top="'Unblock'"
              @click="confirmUnblock(data)"
            />
          </template>
        </Column>

        <template #empty>
          <EmptyState
            icon="pi-ban"
            title="No blocked IPs"
            description="Blocked IP addresses will appear here once you add them."
          />
        </template>
      </DataTable>
    </div>

    <!-- Block IP Dialog -->
    <Dialog
      v-model:visible="showBlockDialog"
      header="Block IP Address"
      :modal="true"
      :style="{ width: '520px' }"
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
            IP Address <span class="text-error-500">*</span>
          </label>
          <InputText
            v-model="blockForm.ip_address"
            placeholder="e.g. 203.0.113.42"
            class="w-full font-mono"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
            Reason
          </label>
          <Textarea
            v-model="blockForm.reason"
            rows="3"
            placeholder="Why is this IP being blocked?"
            class="w-full"
          />
        </div>

        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">Permanent block</p>
            <p class="text-xs text-gray-500 dark:text-brand-400">
              Block indefinitely until manually removed.
            </p>
          </div>
          <ToggleSwitch v-model="blockForm.permanent" />
        </div>

        <div v-if="!blockForm.permanent">
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
            Duration (hours)
          </label>
          <InputNumber
            v-model="blockForm.duration_hours"
            :min="1"
            showButtons
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" class="btn-secondary" @click="showBlockDialog = false" />
        <Button
          label="Block IP"
          icon="pi pi-ban"
          class="btn-primary"
          :loading="submitting"
          @click="submitBlock"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useToast } from '@/composables/useToast'
import { useConfirmDialog } from '@/composables/useConfirm'
import { formatDate, formatDateTime, formatRelativeTime } from '@/utils/formatDate'
import * as monitoringService from '@/services/monitoringService'
import type { BlockedIP, BlockIPRequest, IPReputation } from '@/types/monitoring'

const toast = useToast()
const { confirmDanger } = useConfirmDialog()

// Blocked IPs list state
const loading = ref(false)
const blockedIps = ref<BlockedIP[]>([])

// Reputation lookup state
const lookupIp = ref('')
const lookupLoading = ref(false)
const lookupChecked = ref(false)
const reputation = ref<IPReputation | null>(null)

// Block dialog state
const showBlockDialog = ref(false)
const submitting = ref(false)
const blockForm = reactive<BlockIPRequest>({
  ip_address: '',
  reason: '',
  permanent: false,
  duration_hours: 24,
})

function severityStatus(severity: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  const map: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
    info: 'info',
    warning: 'warning',
    error: 'error',
    critical: 'error',
  }
  return map[severity] || 'neutral'
}

async function loadBlockedIps() {
  loading.value = true
  try {
    const response = await monitoringService.getBlockedIPs()
    blockedIps.value = response.blocked_ips
  } catch {
    toast.error('Failed to load blocked IPs')
  } finally {
    loading.value = false
  }
}

async function checkReputation() {
  const ip = lookupIp.value.trim()
  if (!ip) return

  lookupLoading.value = true
  lookupChecked.value = true
  reputation.value = null
  try {
    reputation.value = await monitoringService.getIPReputation(ip)
  } catch {
    reputation.value = null
    toast.error('Failed to look up IP reputation')
  } finally {
    lookupLoading.value = false
  }
}

function openBlockDialog() {
  blockForm.ip_address = ''
  blockForm.reason = ''
  blockForm.permanent = false
  blockForm.duration_hours = 24
  showBlockDialog.value = true
}

async function submitBlock() {
  if (!blockForm.ip_address.trim()) {
    toast.error('IP address is required')
    return
  }

  submitting.value = true
  try {
    const payload: BlockIPRequest = {
      ip_address: blockForm.ip_address.trim(),
      reason: blockForm.reason?.trim() || undefined,
      permanent: blockForm.permanent,
      duration_hours: blockForm.permanent ? undefined : blockForm.duration_hours,
    }
    await monitoringService.blockIP(payload)
    toast.success('IP blocked', payload.ip_address)
    showBlockDialog.value = false
    await loadBlockedIps()
  } catch {
    toast.error('Failed to block IP')
  } finally {
    submitting.value = false
  }
}

function confirmUnblock(item: BlockedIP) {
  confirmDanger({
    message: `Are you sure you want to unblock ${item.ip_address}?`,
    header: 'Unblock IP',
    acceptLabel: 'Unblock',
    onConfirm: async () => {
      try {
        await monitoringService.unblockIP(item.id)
        toast.success('IP unblocked', item.ip_address)
        await loadBlockedIps()
      } catch {
        toast.error('Failed to unblock IP')
      }
    },
  })
}

onMounted(loadBlockedIps)

// Surface riskStatus to the template.
const riskStatus = monitoringService.riskStatus
</script>
