<template>
  <div>
    <PageHeader
      title="Security Events"
      subtitle="View and filter all security-related events"
      :breadcrumbs="[{ label: 'Security', to: { name: 'Security' } }]"
    >
      <template #actions>
        <Button
          label="Export"
          icon="pi pi-download"
          class="btn-secondary"
          @click="exportEvents"
        />
      </template>
    </PageHeader>

    <!-- Filters -->
    <div class="card p-4 mb-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Select
          v-model="filters.event_type"
          :options="eventTypeOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Event Type"
          showClear
          class="w-full"
          @change="loadEvents"
        />
        <Select
          v-model="filters.severity"
          :options="severityOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Severity"
          showClear
          class="w-full"
          @change="loadEvents"
        />
        <InputText
          v-model="filters.ip_address"
          placeholder="IP Address"
          class="w-full"
          @keyup.enter="loadEvents"
        />
        <DatePicker
          v-model="filters.dateRange"
          selectionMode="range"
          placeholder="Date Range"
          class="w-full"
          @date-select="loadEvents"
        />
        <Button
          label="Clear Filters"
          icon="pi pi-filter-slash"
          class="p-button-outlined"
          @click="clearFilters"
        />
      </div>
    </div>

    <!-- Events Table -->
    <div class="card overflow-hidden">
      <DataTable
        :value="events"
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

        <Column field="event_type" header="Event" style="min-width: 200px">
          <template #body="{ data }">
            <div class="flex items-center gap-2">
              <i
                :class="[
                  'pi text-sm',
                  getEventIcon(data.event_type),
                  getSeverityColor(data.severity)
                ]"
              ></i>
              <span class="font-medium text-gray-900 dark:text-white">
                {{ getEventLabel(data.event_type) }}
              </span>
            </div>
          </template>
        </Column>

        <Column field="severity" header="Severity" style="width: 120px">
          <template #body="{ data }">
            <StatusBadge
              :status="getSeverityStatus(data.severity)"
              :label="data.severity"
            />
          </template>
        </Column>

        <Column field="user_email" header="User" style="width: 200px">
          <template #body="{ data }">
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {{ data.user_email || '-' }}
            </span>
          </template>
        </Column>

        <Column field="ip_address" header="IP Address" style="width: 150px">
          <template #body="{ data }">
            <span class="text-sm font-mono text-gray-600 dark:text-brand-400">
              {{ data.ip_address }}
            </span>
          </template>
        </Column>

        <Column field="app_name" header="Application" style="width: 150px">
          <template #body="{ data }">
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {{ data.app_name || '-' }}
            </span>
          </template>
        </Column>

        <Column header="" style="width: 60px">
          <template #body="{ data }">
            <Button
              icon="pi pi-eye"
              class="p-button-text p-button-sm"
              v-tooltip.top="'View Details'"
              @click="showEventDetails(data)"
            />
          </template>
        </Column>

        <template #empty>
          <EmptyState
            icon="pi-shield"
            title="No events found"
            description="Try adjusting your filters or check back later"
          />
        </template>
      </DataTable>
    </div>

    <!-- Event Details Dialog -->
    <Dialog
      v-model:visible="showDetails"
      header="Event Details"
      :modal="true"
      :style="{ width: '600px' }"
    >
      <div v-if="selectedEvent" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
              Event Type
            </label>
            <p class="text-gray-900 dark:text-white">
              {{ getEventLabel(selectedEvent.event_type) }}
            </p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
              Severity
            </label>
            <StatusBadge
              :status="getSeverityStatus(selectedEvent.severity)"
              :label="selectedEvent.severity"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
              Time
            </label>
            <p class="text-gray-900 dark:text-white">
              {{ formatDateTime(selectedEvent.created_at) }}
            </p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
              IP Address
            </label>
            <p class="font-mono text-gray-900 dark:text-white">
              {{ selectedEvent.ip_address }}
            </p>
          </div>
          <div v-if="selectedEvent.user_email">
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
              User
            </label>
            <p class="text-gray-900 dark:text-white">
              {{ selectedEvent.user_email }}
            </p>
          </div>
          <div v-if="selectedEvent.app_name">
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
              Application
            </label>
            <p class="text-gray-900 dark:text-white">
              {{ selectedEvent.app_name }}
            </p>
          </div>
        </div>

        <div v-if="selectedEvent.user_agent">
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
            User Agent
          </label>
          <p class="text-sm text-gray-700 dark:text-gray-300 break-all">
            {{ selectedEvent.user_agent }}
          </p>
        </div>

        <div v-if="Object.keys(selectedEvent.details || {}).length > 0">
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
            Additional Details
          </label>
          <pre class="text-xs bg-gray-50 dark:bg-brand-800 p-3 rounded-lg overflow-auto">{{ JSON.stringify(selectedEvent.details, null, 2) }}</pre>
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
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useToast } from '@/composables/useToast'
import * as securityService from '@/services/securityService'
import { formatDate, formatTime, formatDateTime } from '@/utils/formatDate'
import type { SecurityEvent, SecurityEventType, EventSeverity } from '@/types/security'

const toast = useToast()

// State
const loading = ref(false)
const events = ref<SecurityEvent[]>([])
const totalCount = ref(0)
const selectedEvent = ref<SecurityEvent | null>(null)
const showDetails = ref(false)

const filters = reactive({
  event_type: null as SecurityEventType | null,
  severity: null as EventSeverity | null,
  ip_address: '',
  dateRange: null as Date[] | null,
  page: 1,
  page_size: 25
})

// Options
const eventTypeOptions = [
  { label: 'Login Success', value: 'login_success' },
  { label: 'Login Failed', value: 'login_failed' },
  { label: 'Logout', value: 'logout' },
  { label: 'Account Locked', value: 'account_locked' },
  { label: 'Password Changed', value: 'password_changed' },
  { label: 'Brute Force Detected', value: 'brute_force_detected' },
  { label: 'Suspicious Activity', value: 'suspicious_activity' }
]

const severityOptions = [
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warning' },
  { label: 'Error', value: 'error' },
  { label: 'Critical', value: 'critical' }
]

// Methods
async function loadEvents() {
  loading.value = true

  try {
    const response = await securityService.getSecurityEvents({
      event_type: filters.event_type || undefined,
      severity: filters.severity || undefined,
      ip_address: filters.ip_address || undefined,
      from: filters.dateRange?.[0]?.toISOString(),
      to: filters.dateRange?.[1]?.toISOString(),
      page: filters.page,
      page_size: filters.page_size
    })

    events.value = response.events
    totalCount.value = response.total
  } catch (error) {
    console.error('Failed to load events:', error)
    toast.error('Failed to load security events')
  } finally {
    loading.value = false
  }
}

function onPage(event: any) {
  filters.page = event.page + 1
  filters.page_size = event.rows
  loadEvents()
}

function clearFilters() {
  filters.event_type = null
  filters.severity = null
  filters.ip_address = ''
  filters.dateRange = null
  filters.page = 1
  loadEvents()
}

function showEventDetails(event: SecurityEvent) {
  selectedEvent.value = event
  showDetails.value = true
}

async function exportEvents() {
  try {
    const blob = await securityService.exportSecurityLogs({
      event_type: filters.event_type || undefined,
      severity: filters.severity || undefined,
      from: filters.dateRange?.[0]?.toISOString(),
      to: filters.dateRange?.[1]?.toISOString()
    })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `security-events-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
    toast.success('Export downloaded')
  } catch {
    toast.error('Failed to export events')
  }
}

function getEventLabel(type: string): string {
  return securityService.securityEventLabels[type] || type
}

function getEventIcon(type: string): string {
  const icons: Record<string, string> = {
    login_success: 'pi-sign-in',
    login_failed: 'pi-times',
    logout: 'pi-sign-out',
    account_locked: 'pi-lock',
    account_unlocked: 'pi-unlock',
    password_changed: 'pi-key',
    brute_force_detected: 'pi-exclamation-triangle',
    suspicious_activity: 'pi-exclamation-circle'
  }
  return icons[type] || 'pi-info-circle'
}

function getSeverityColor(severity: string): string {
  const classes: Record<string, string> = {
    info: 'text-brand-600 dark:text-brand-400',
    warning: 'text-warning-600 dark:text-warning-400',
    error: 'text-error-600 dark:text-error-400',
    critical: 'text-error-600 dark:text-error-400'
  }
  return classes[severity] || classes.info
}

function getSeverityStatus(severity: string): 'info' | 'warning' | 'error' {
  const map: Record<string, 'info' | 'warning' | 'error'> = {
    info: 'info',
    warning: 'warning',
    error: 'error',
    critical: 'error'
  }
  return map[severity] || 'info'
}

onMounted(loadEvents)
</script>
