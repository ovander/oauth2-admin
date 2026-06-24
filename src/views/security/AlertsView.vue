<template>
  <div>
    <PageHeader
      title="Alerts"
      subtitle="Manage alert rules and review triggered alerts"
      :breadcrumbs="[{ label: 'Security', to: { name: 'Security' } }]"
    >
      <template #actions>
        <Button
          label="New Rule"
          icon="pi pi-plus"
          class="btn-primary"
          @click="openCreateDialog"
        />
      </template>
    </PageHeader>

    <!-- Alert Rules -->
    <div class="card overflow-hidden mb-6">
      <div class="p-6 pb-0">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Alert Rules</h3>
      </div>
      <DataTable
        :value="rules"
        :loading="rulesLoading"
        responsiveLayout="scroll"
        class="p-datatable-sm"
      >
        <Column field="name" header="Name" style="min-width: 200px">
          <template #body="{ data }">
            <div>
              <p class="text-sm font-medium text-gray-900 dark:text-white">
                {{ data.name }}
              </p>
              <p v-if="data.description" class="text-xs text-gray-500 dark:text-brand-400">
                {{ data.description }}
              </p>
            </div>
          </template>
        </Column>

        <Column field="event_type" header="Event Type" style="min-width: 160px">
          <template #body="{ data }">
            <span class="text-sm font-mono text-gray-600 dark:text-brand-400">
              {{ data.event_type }}
            </span>
          </template>
        </Column>

        <Column field="severity" header="Severity" style="width: 120px">
          <template #body="{ data }">
            <StatusBadge :status="getSeverityStatus(data.severity)" :label="data.severity" />
          </template>
        </Column>

        <Column field="actions" header="Actions" style="min-width: 160px">
          <template #body="{ data }">
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {{ getActionsLabel(data.actions) }}
            </span>
          </template>
        </Column>

        <Column field="enabled" header="Enabled" style="width: 120px">
          <template #body="{ data }">
            <StatusBadge
              :status="data.enabled ? 'success' : 'neutral'"
              :label="data.enabled ? 'Enabled' : 'Disabled'"
            />
          </template>
        </Column>

        <Column header="" style="width: 110px">
          <template #body="{ data }">
            <div class="flex items-center gap-1">
              <Button
                icon="pi pi-pencil"
                class="p-button-text p-button-sm"
                v-tooltip.top="'Edit'"
                @click="openEditDialog(data)"
              />
              <Button
                icon="pi pi-trash"
                class="p-button-text p-button-sm p-button-danger"
                v-tooltip.top="'Delete'"
                @click="confirmDeleteRule(data)"
              />
            </div>
          </template>
        </Column>

        <template #empty>
          <EmptyState
            icon="pi-bell"
            title="No alert rules"
            description="Create your first alert rule to start monitoring events"
          />
        </template>
      </DataTable>
    </div>

    <!-- Alert History -->
    <div class="card overflow-hidden">
      <div class="p-6 pb-0 flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Alert History</h3>
        <StatusBadge
          v-if="unacknowledged > 0"
          status="warning"
          :label="`${unacknowledged} unacknowledged`"
        />
      </div>
      <DataTable
        :value="alerts"
        :loading="historyLoading"
        responsiveLayout="scroll"
        class="p-datatable-sm"
      >
        <Column field="triggered_at" header="Time" style="width: 180px">
          <template #body="{ data }">
            <span class="text-sm text-gray-900 dark:text-white">
              {{ formatDateTime(data.triggered_at) }}
            </span>
          </template>
        </Column>

        <Column field="rule_name" header="Rule" style="min-width: 160px">
          <template #body="{ data }">
            <span class="text-sm text-gray-900 dark:text-white">
              {{ data.rule_name }}
            </span>
          </template>
        </Column>

        <Column field="severity" header="Severity" style="width: 120px">
          <template #body="{ data }">
            <StatusBadge :status="getSeverityStatus(data.severity)" :label="data.severity" />
          </template>
        </Column>

        <Column field="message" header="Message" style="min-width: 200px">
          <template #body="{ data }">
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {{ data.message }}
            </span>
          </template>
        </Column>

        <Column field="acknowledged" header="Status" style="width: 120px">
          <template #body="{ data }">
            <StatusBadge
              :status="data.acknowledged ? 'success' : 'warning'"
              :label="data.acknowledged ? 'Acked' : 'Open'"
            />
          </template>
        </Column>

        <Column header="" style="width: 140px">
          <template #body="{ data }">
            <Button
              v-if="!data.acknowledged"
              label="Acknowledge"
              icon="pi pi-check"
              class="p-button-text p-button-sm"
              @click="confirmAcknowledge(data)"
            />
          </template>
        </Column>

        <template #empty>
          <EmptyState
            icon="pi-inbox"
            title="No triggered alerts"
            description="Triggered alerts will appear here"
          />
        </template>
      </DataTable>
    </div>

    <!-- Rule Dialog -->
    <Dialog
      v-model:visible="showRuleDialog"
      :header="editingId === null ? 'New Alert Rule' : 'Edit Alert Rule'"
      :modal="true"
      :style="{ width: '560px' }"
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Name</label>
          <InputText v-model="form.name" class="w-full" placeholder="Rule name" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Description</label>
          <Textarea v-model="form.description" class="w-full" rows="2" autoResize placeholder="Optional description" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Event Type</label>
          <InputText v-model="form.event_type" class="w-full" placeholder="e.g. login_failed" />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Severity</label>
            <Select
              v-model="form.severity"
              :options="severityOptions"
              optionLabel="label"
              optionValue="value"
              class="w-full"
            />
          </div>
          <div class="flex items-end">
            <div class="flex items-center gap-2">
              <ToggleSwitch v-model="form.enabled" inputId="rule-enabled" />
              <label for="rule-enabled" class="text-sm text-gray-700 dark:text-gray-300">Enabled</label>
            </div>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Actions</label>
          <MultiSelect
            v-model="form.actions"
            :options="actionOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select actions"
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Recipients</label>
          <InputText v-model="form.recipients" class="w-full" placeholder="comma-separated emails" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Webhook URL</label>
          <InputText v-model="form.webhook_url" class="w-full" placeholder="https://..." />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">Condition (JSON)</label>
          <Textarea v-model="form.condition" class="w-full font-mono text-xs" rows="4" autoResize />
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" class="btn-secondary" :disabled="submitting" @click="showRuleDialog = false" />
        <Button
          :label="editingId === null ? 'Create' : 'Save'"
          class="btn-primary"
          :loading="submitting"
          @click="submitRule"
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
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import ToggleSwitch from 'primevue/toggleswitch'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useToast } from '@/composables/useToast'
import { useConfirmDialog } from '@/composables/useConfirm'
import { formatDateTime } from '@/utils/formatDate'
import * as monitoringService from '@/services/monitoringService'
import type { AlertRule, AlertRuleRequest, TriggeredAlert } from '@/types/monitoring'

const toast = useToast()
const { confirmDelete, confirmAction } = useConfirmDialog()

type Severity = 'info' | 'warning' | 'error' | 'critical'

// State
const rules = ref<AlertRule[]>([])
const rulesLoading = ref(false)
const alerts = ref<TriggeredAlert[]>([])
const historyLoading = ref(false)
const unacknowledged = ref(0)

const showRuleDialog = ref(false)
const submitting = ref(false)
const editingId = ref<number | null>(null)

interface RuleForm {
  name: string
  description: string
  event_type: string
  severity: Severity
  enabled: boolean
  actions: string[]
  recipients: string
  webhook_url: string
  condition: string
}

function emptyForm(): RuleForm {
  return {
    name: '',
    description: '',
    event_type: '',
    severity: 'warning',
    enabled: true,
    actions: [],
    recipients: '',
    webhook_url: '',
    condition: '{}',
  }
}

const form = reactive<RuleForm>(emptyForm())

// Options
const severityOptions = [
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warning' },
  { label: 'Error', value: 'error' },
  { label: 'Critical', value: 'critical' },
]

const actionOptions = [
  { label: 'Email', value: 'email' },
  { label: 'Webhook', value: 'webhook' },
  { label: 'Log', value: 'log' },
]

// Helpers
function getSeverityStatus(severity: string): 'info' | 'warning' | 'error' {
  const map: Record<string, 'info' | 'warning' | 'error'> = {
    info: 'info',
    warning: 'warning',
    error: 'error',
    critical: 'error',
  }
  return map[severity] || 'info'
}

function getActionsLabel(actions: string[]): string {
  if (!actions || actions.length === 0) return '-'
  return actions.map((a) => monitoringService.alertActionLabels[a] || a).join(', ')
}

// Loaders
async function loadRules() {
  rulesLoading.value = true
  try {
    const response = await monitoringService.getAlertRules()
    rules.value = response.rules
  } catch {
    toast.error('Failed to load alert rules')
  } finally {
    rulesLoading.value = false
  }
}

async function loadHistory() {
  historyLoading.value = true
  try {
    const response = await monitoringService.getAlertHistory()
    alerts.value = response.alerts
    unacknowledged.value = response.unacknowledged
  } catch {
    toast.error('Failed to load alert history')
  } finally {
    historyLoading.value = false
  }
}

// Rule dialog
function openCreateDialog() {
  editingId.value = null
  Object.assign(form, emptyForm())
  showRuleDialog.value = true
}

function openEditDialog(rule: AlertRule) {
  editingId.value = rule.id
  Object.assign(form, {
    name: rule.name,
    description: rule.description ?? '',
    event_type: rule.event_type,
    severity: rule.severity,
    enabled: rule.enabled,
    actions: [...rule.actions],
    recipients: (rule.recipients ?? []).join(', '),
    webhook_url: rule.webhook_url ?? '',
    condition: JSON.stringify(rule.condition ?? {}, null, 2),
  })
  showRuleDialog.value = true
}

async function submitRule() {
  if (!form.name.trim()) {
    toast.error('Name is required')
    return
  }
  if (!form.event_type.trim()) {
    toast.error('Event type is required')
    return
  }

  let condition: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(form.condition || '{}')
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    condition = parsed as Record<string, unknown>
  } catch {
    toast.error('Condition must be valid JSON object')
    return
  }

  const recipients = form.recipients
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0)

  const payload: AlertRuleRequest = {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    event_type: form.event_type.trim(),
    condition,
    severity: form.severity,
    enabled: form.enabled,
    actions: form.actions,
    recipients: recipients.length > 0 ? recipients : undefined,
    webhook_url: form.webhook_url.trim() || undefined,
  }

  submitting.value = true
  try {
    if (editingId.value === null) {
      await monitoringService.createAlertRule(payload)
      toast.success('Alert rule created')
    } else {
      await monitoringService.updateAlertRule(editingId.value, payload)
      toast.success('Alert rule updated')
    }
    showRuleDialog.value = false
    await loadRules()
  } catch {
    toast.error('Failed to save alert rule')
  } finally {
    submitting.value = false
  }
}

function confirmDeleteRule(rule: AlertRule) {
  confirmDelete({
    header: 'Delete Alert Rule',
    message: `Are you sure you want to delete "${rule.name}"?`,
    onConfirm: async () => {
      try {
        await monitoringService.deleteAlertRule(rule.id)
        toast.success('Alert rule deleted')
        await loadRules()
      } catch {
        toast.error('Failed to delete alert rule')
      }
    },
  })
}

function confirmAcknowledge(alert: TriggeredAlert) {
  confirmAction({
    header: 'Acknowledge Alert',
    message: 'Acknowledge this alert?',
    acceptLabel: 'Acknowledge',
    onConfirm: async () => {
      try {
        await monitoringService.acknowledgeAlert(alert.id)
        toast.success('Alert acknowledged')
        await loadHistory()
      } catch {
        toast.error('Failed to acknowledge alert')
      }
    },
  })
}

onMounted(() => {
  loadRules()
  loadHistory()
})
</script>
