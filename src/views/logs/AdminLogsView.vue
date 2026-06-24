<template>
  <div>
    <PageHeader
      title="Audit Logs"
      subtitle="Track administrative actions across the Socrate server"
    >
      <template #actions>
        <Button
          label="Export"
          icon="pi pi-download"
          class="btn-secondary"
          :loading="exporting"
          @click="exportLogs"
        />
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="card p-4 mb-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Select
          v-model="filters.action"
          :options="actionOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Action"
          showClear
          class="w-full"
          @change="reload"
        />
        <Select
          v-model="filters.target_type"
          :options="targetTypeOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Target Type"
          showClear
          class="w-full"
          @change="reload"
        />
        <DatePicker
          v-model="filters.dateRange"
          selectionMode="range"
          placeholder="Date Range"
          class="w-full"
          @date-select="reload"
        />
        <Button
          label="Clear Filters"
          icon="pi pi-filter-slash"
          class="p-button-outlined"
          @click="clearFilters"
        />
      </div>
    </div>

    <!-- Logs Table -->
    <div class="card overflow-hidden">
      <DataTable
        :value="logs"
        :loading="loading"
        :rows="filters.page_size"
        :totalRecords="totalCount"
        :lazy="true"
        :paginator="true"
        :rowsPerPageOptions="[25, 50, 100]"
        responsiveLayout="scroll"
        class="p-datatable-sm"
        @page="onPage"
      >
        <Column field="created_at" header="Time" style="width: 180px">
          <template #body="{ data }">
            <div>
              <p class="text-sm text-gray-900 dark:text-white">
                {{ formatDate(data.created_at) }}
              </p>
              <p class="text-xs text-gray-500 dark:text-brand-400">
                {{ formatTime(data.created_at) }}
              </p>
            </div>
          </template>
        </Column>

        <Column field="admin_email" header="Admin" style="min-width: 200px">
          <template #body="{ data }">
            <span class="text-sm text-gray-900 dark:text-white">
              {{ data.admin_email }}
            </span>
          </template>
        </Column>

        <Column field="action" header="Action" style="width: 160px">
          <template #body="{ data }">
            <StatusBadge :status="getActionStatus(data.action)" :label="getActionLabel(data.action)" />
          </template>
        </Column>

        <Column field="target_type" header="Target" style="min-width: 180px">
          <template #body="{ data }">
            <div>
              <p class="text-sm text-gray-900 dark:text-white capitalize">
                {{ data.target_type }}
              </p>
              <p v-if="data.target_name" class="text-xs text-gray-500 dark:text-brand-400">
                {{ data.target_name }}
              </p>
            </div>
          </template>
        </Column>

        <Column field="ip_address" header="IP Address" style="width: 150px">
          <template #body="{ data }">
            <span class="text-sm font-mono text-gray-600 dark:text-brand-400">
              {{ data.ip_address }}
            </span>
          </template>
        </Column>

        <Column header="" style="width: 60px">
          <template #body="{ data }">
            <Button
              icon="pi pi-eye"
              class="p-button-text p-button-sm"
              v-tooltip.top="'View Details'"
              @click="showLogDetails(data)"
            />
          </template>
        </Column>

        <template #empty>
          <EmptyState
            icon="pi-list"
            title="No audit logs found"
            description="Try adjusting your filters or check back later"
          />
        </template>
      </DataTable>
    </div>

    <!-- Log Details Dialog -->
    <Dialog
      v-model:visible="showDetails"
      header="Audit Log Details"
      :modal="true"
      :style="{ width: '600px' }"
    >
      <div v-if="selectedLog" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Action</label>
            <StatusBadge :status="getActionStatus(selectedLog.action)" :label="getActionLabel(selectedLog.action)" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Time</label>
            <p class="text-gray-900 dark:text-white">{{ formatDateTime(selectedLog.created_at) }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Admin</label>
            <p class="text-gray-900 dark:text-white">{{ selectedLog.admin_email }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">IP Address</label>
            <p class="font-mono text-gray-900 dark:text-white">{{ selectedLog.ip_address }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Target</label>
            <p class="text-gray-900 dark:text-white capitalize">{{ selectedLog.target_type }}</p>
          </div>
          <div v-if="selectedLog.target_name">
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Target Name</label>
            <p class="text-gray-900 dark:text-white">{{ selectedLog.target_name }}</p>
          </div>
        </div>

        <div v-if="selectedLog.changes && Object.keys(selectedLog.changes).length > 0">
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Changes</label>
          <pre class="text-xs bg-gray-50 dark:bg-brand-800 p-3 rounded-lg overflow-auto">{{ JSON.stringify(selectedLog.changes, null, 2) }}</pre>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useToast } from '@/composables/useToast'
import * as securityService from '@/services/securityService'
import { formatDate, formatTime, formatDateTime } from '@/utils/formatDate'
import type { AdminAuditLog, AuditActionType } from '@/types/security'

const toast = useToast()

// State
const loading = ref(false)
const exporting = ref(false)
const logs = ref<AdminAuditLog[]>([])
const totalCount = ref(0)
const selectedLog = ref<AdminAuditLog | null>(null)
const showDetails = ref(false)

const filters = reactive({
  action: null as AuditActionType | null,
  target_type: null as 'user' | 'application' | 'settings' | null,
  dateRange: null as Date[] | null,
  page: 1,
  page_size: 25,
})

// Options
const actionOptions = [
  { label: 'Created', value: 'create' },
  { label: 'Updated', value: 'update' },
  { label: 'Deleted', value: 'delete' },
  { label: 'Locked', value: 'lock' },
  { label: 'Unlocked', value: 'unlock' },
  { label: 'Invited', value: 'invite' },
  { label: 'Revoked', value: 'revoke' },
  { label: 'Regenerated Secret', value: 'regenerate_secret' },
  { label: 'Changed Role', value: 'change_role' },
  { label: 'Bulk Action', value: 'bulk_action' },
]

const targetTypeOptions = [
  { label: 'User', value: 'user' },
  { label: 'Application', value: 'application' },
  { label: 'Settings', value: 'settings' },
]

// Methods
function currentFilters() {
  return {
    action: filters.action || undefined,
    target_type: filters.target_type || undefined,
    start_date: filters.dateRange?.[0]?.toISOString(),
    end_date: filters.dateRange?.[1]?.toISOString(),
    page: filters.page,
    page_size: filters.page_size,
  }
}

async function loadLogs() {
  loading.value = true
  try {
    const response = await securityService.getAdminAuditLogs(currentFilters())
    logs.value = response.logs
    totalCount.value = response.total_count
  } catch {
    toast.error('Failed to load audit logs')
  } finally {
    loading.value = false
  }
}

function reload() {
  filters.page = 1
  loadLogs()
}

function onPage(event: { page: number; rows: number }) {
  filters.page = event.page + 1
  filters.page_size = event.rows
  loadLogs()
}

function clearFilters() {
  filters.action = null
  filters.target_type = null
  filters.dateRange = null
  reload()
}

function showLogDetails(log: AdminAuditLog) {
  selectedLog.value = log
  showDetails.value = true
}

async function exportLogs() {
  exporting.value = true
  try {
    const blob = await securityService.exportAdminLogs(currentFilters())
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
    toast.success('Export downloaded')
  } catch {
    toast.error('Failed to export audit logs')
  } finally {
    exporting.value = false
  }
}

function getActionLabel(action: string): string {
  return securityService.adminActionLabels[action] || action
}

function getActionStatus(action: string): 'success' | 'info' | 'warning' | 'error' {
  const map: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
    create: 'success',
    update: 'info',
    delete: 'error',
    lock: 'warning',
    unlock: 'success',
    revoke: 'error',
    regenerate_secret: 'warning',
    change_role: 'info',
    invite: 'info',
    bulk_action: 'info',
  }
  return map[action] || 'info'
}

onMounted(loadLogs)
</script>
