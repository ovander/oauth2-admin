<template>
  <div>
    <PageHeader
      title="Security Reports"
      subtitle="Generate and download point-in-time security reports"
      :breadcrumbs="[{ label: 'Security', to: { name: 'Security' } }]"
    />

    <!-- Generate Report -->
    <div class="card p-6 mb-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Generate Report
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
            Date Range
          </label>
          <DatePicker
            v-model="dateRange"
            selectionMode="range"
            placeholder="Select range"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
            Format
          </label>
          <Select
            v-model="format"
            :options="formatOptions"
            optionLabel="label"
            optionValue="value"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
            Sections
          </label>
          <MultiSelect
            v-model="sections"
            :options="sectionOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="All sections"
            class="w-full"
          />
        </div>
        <div class="flex items-end">
          <Button
            label="Generate"
            icon="pi pi-file"
            class="btn-primary"
            :loading="generating"
            :disabled="!hasDateRange || generating"
            @click="generate"
          />
        </div>
      </div>
    </div>

    <!-- Reports -->
    <div class="card overflow-hidden">
      <DataTable :value="reports" responsiveLayout="scroll" class="p-datatable-sm">
        <Column field="created_at" header="Created" style="width: 200px">
          <template #body="{ data }">
            <span class="text-sm text-gray-900 dark:text-white">
              {{ formatDateTime(data.created_at) }}
            </span>
          </template>
        </Column>

        <Column field="type" header="Type" style="width: 140px">
          <template #body="{ data }">
            <span class="text-sm text-gray-700 dark:text-gray-300 capitalize">
              {{ data.type }}
            </span>
          </template>
        </Column>

        <Column field="format" header="Format" style="width: 120px">
          <template #body="{ data }">
            <span class="text-sm font-mono text-gray-600 dark:text-brand-400">
              {{ data.format.toUpperCase() }}
            </span>
          </template>
        </Column>

        <Column field="status" header="Status" style="width: 140px">
          <template #body="{ data }">
            <StatusBadge :status="getStatusBadge(data.status)" :label="data.status" />
          </template>
        </Column>

        <Column header="" style="width: 140px">
          <template #body="{ data }">
            <Button
              label="Download"
              icon="pi pi-download"
              class="btn-secondary p-button-sm"
              :disabled="data.status !== 'completed'"
              @click="download(data)"
            />
          </template>
        </Column>

        <template #empty>
          <EmptyState
            icon="pi-file"
            title="No reports yet"
            description="Generate a report above to see it listed here"
          />
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import MultiSelect from 'primevue/multiselect'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useToast } from '@/composables/useToast'
import { formatDateTime } from '@/utils/formatDate'
import * as monitoringService from '@/services/monitoringService'
import type { ReportRequest, ReportResponse } from '@/types/monitoring'

const toast = useToast()

// Form state
const dateRange = ref<Date[] | null>(null)
const format = ref<string>('pdf')
const sections = ref<string[]>([])
const generating = ref(false)

// Note: there is no list-all-reports endpoint, so this table only reflects
// reports generated during the current session.
const reports = ref<ReportResponse[]>([])

// Polling interval ids keyed by report_id.
const pollers = new Map<string, number>()

const formatOptions = [
  { label: 'PDF', value: 'pdf' },
  { label: 'CSV', value: 'csv' },
  { label: 'JSON', value: 'json' },
]

const sectionOptions = [
  { label: 'Overview', value: 'overview' },
  { label: 'Threats', value: 'threats' },
  { label: 'Users', value: 'users' },
  { label: 'Apps', value: 'apps' },
]

const hasDateRange = computed<boolean>(
  () => !!dateRange.value && !!dateRange.value[0] && !!dateRange.value[1]
)

function getStatusBadge(
  status: ReportResponse['status']
): 'success' | 'error' | 'info' {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'error'
  return 'info'
}

async function generate(): Promise<void> {
  const range = dateRange.value
  if (!range || !range[0] || !range[1]) return

  generating.value = true
  try {
    const payload: ReportRequest = {
      type: 'security',
      period: {
        from: range[0].toISOString(),
        to: range[1].toISOString(),
      },
      format: format.value,
      sections: sections.value.length > 0 ? sections.value : undefined,
    }
    const report = await monitoringService.generateSecurityReport(payload)
    reports.value.unshift(report)
    toast.success('Report generation started')

    if (report.status === 'pending' || report.status === 'processing') {
      startPolling(report.report_id)
    }
  } catch {
    toast.error('Failed to generate report')
  } finally {
    generating.value = false
  }
}

function startPolling(reportId: string): void {
  if (pollers.has(reportId)) return

  const intervalId = window.setInterval(async () => {
    try {
      const updated = await monitoringService.getReportStatus(reportId)
      const index = reports.value.findIndex((r) => r.report_id === reportId)
      if (index !== -1) {
        reports.value[index] = updated
      }
      if (updated.status === 'completed' || updated.status === 'failed') {
        stopPolling(reportId)
      }
    } catch {
      stopPolling(reportId)
      toast.error('Failed to update report status')
    }
  }, 3000)

  pollers.set(reportId, intervalId)
}

function stopPolling(reportId: string): void {
  const intervalId = pollers.get(reportId)
  if (intervalId !== undefined) {
    window.clearInterval(intervalId)
    pollers.delete(reportId)
  }
}

async function download(report: ReportResponse): Promise<void> {
  try {
    const blob = await monitoringService.downloadReport(report.report_id)
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `security-report-${report.report_id}.${report.format}`
    a.click()
    window.URL.revokeObjectURL(url)
    toast.success('Report downloaded')
  } catch {
    toast.error('Failed to download report')
  }
}

onBeforeUnmount(() => {
  for (const intervalId of pollers.values()) {
    window.clearInterval(intervalId)
  }
  pollers.clear()
})
</script>
