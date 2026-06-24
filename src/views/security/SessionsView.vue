<template>
  <div>
    <PageHeader
      title="Active Sessions"
      subtitle="Live sessions across all applications"
      :breadcrumbs="[{ label: 'Security', to: { name: 'Security' } }]"
    />

    <!-- Filters -->
    <div class="card p-4 mb-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InputText
          v-model="userIdFilter"
          type="number"
          placeholder="User ID"
          class="w-full"
          @keyup.enter="applyFilters"
        />
        <InputText
          v-model="appIdFilter"
          type="number"
          placeholder="App ID"
          class="w-full"
          @keyup.enter="applyFilters"
        />
        <Button
          label="Apply"
          icon="pi pi-filter"
          class="btn-primary"
          @click="applyFilters"
        />
        <Button
          label="Clear"
          icon="pi pi-filter-slash"
          class="p-button-outlined"
          @click="clearFilters"
        />
      </div>
    </div>

    <!-- Sessions Table -->
    <!-- Read-only: the admin API exposes no session-revoke endpoint, so no terminate action is offered. -->
    <div class="card overflow-hidden">
      <DataTable
        :value="sessions"
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
        <Column field="user_email" header="User" style="min-width: 220px">
          <template #body="{ data }">
            <div>
              <p class="text-sm text-gray-900 dark:text-white">
                {{ data.user_email }}
              </p>
              <p class="text-xs text-gray-500 dark:text-brand-400">
                ID {{ data.user_id }}
              </p>
            </div>
          </template>
        </Column>

        <Column field="app_name" header="Application" style="min-width: 160px">
          <template #body="{ data }">
            <span class="text-sm text-gray-900 dark:text-white">
              {{ data.app_name || '—' }}
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

        <Column field="created_at" header="Created" style="width: 180px">
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

        <Column field="last_activity" header="Last Activity" style="width: 160px">
          <template #body="{ data }">
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {{ formatRelativeTime(data.last_activity) }}
            </span>
          </template>
        </Column>

        <Column field="expires_at" header="Expires" style="width: 150px">
          <template #body="{ data }">
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {{ formatDate(data.expires_at) }}
            </span>
          </template>
        </Column>

        <template #empty>
          <EmptyState
            icon="pi-desktop"
            title="No active sessions"
            description="There are no active sessions matching the current filters"
          />
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { formatDate, formatTime, formatRelativeTime } from '@/utils/formatDate'
import * as monitoringService from '@/services/monitoringService'
import type { AdminSession } from '@/types/monitoring'

const toast = useToast()

// State
const loading = ref(false)
const sessions = ref<AdminSession[]>([])
const totalCount = ref(0)

const userIdFilter = ref('')
const appIdFilter = ref('')

const filters = reactive({
  user_id: undefined as number | undefined,
  app_id: undefined as number | undefined,
  page: 1,
  page_size: 25,
})

// Methods
async function loadSessions() {
  loading.value = true
  try {
    const response = await monitoringService.getSessions({
      user_id: filters.user_id,
      app_id: filters.app_id,
      page: filters.page,
      page_size: filters.page_size,
    })
    sessions.value = response.sessions
    totalCount.value = response.total
  } catch {
    sessions.value = []
    totalCount.value = 0
    toast.error('Failed to load sessions')
  } finally {
    loading.value = false
  }
}

function parseId(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? undefined : parsed
}

function applyFilters() {
  filters.user_id = parseId(userIdFilter.value)
  filters.app_id = parseId(appIdFilter.value)
  filters.page = 1
  loadSessions()
}

function clearFilters() {
  userIdFilter.value = ''
  appIdFilter.value = ''
  filters.user_id = undefined
  filters.app_id = undefined
  filters.page = 1
  loadSessions()
}

function onPage(event: { page: number; rows: number }) {
  filters.page = event.page + 1
  filters.page_size = event.rows
  loadSessions()
}

onMounted(loadSessions)
</script>
