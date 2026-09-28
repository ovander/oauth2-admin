<template>
  <div>
    <PageHeader
      title="Access policy"
      subtitle="Declarative rules consulted on every admin request and by applications"
      :breadcrumbs="[{ label: 'Security', to: { name: 'Security' } }]"
    >
      <template #actions>
        <Button label="Refresh" icon="pi pi-refresh" class="btn-secondary" :loading="ed.loading.value" @click="ed.load()" />
      </template>
    </PageHeader>

    <Message v-if="ed.loadError.value" severity="warn" :closable="false" class="mb-6">
      {{ ed.loadError.value }}
    </Message>

    <!-- Mode and current version -->
    <div class="card p-6 mb-6" data-test="mode-card">
      <div class="flex flex-wrap items-center gap-3 mb-2">
        <span class="text-sm font-medium text-gray-500 dark:text-brand-400">Mode</span>
        <StatusBadge :status="modeDetails.status" :label="modeDetails.label" />
        <template v-if="ed.policy.value">
          <span class="text-sm text-gray-500 dark:text-brand-400 ml-4">Version</span>
          <span class="text-sm font-mono font-semibold text-gray-900 dark:text-white" data-test="current-version">
            v{{ ed.policy.value.version }}
          </span>
          <span class="text-xs text-gray-500 dark:text-brand-400">
            saved {{ formatDateTime(ed.policy.value.created_at) }}
            <template v-if="ed.policy.value.created_by"> by user #{{ ed.policy.value.created_by }}</template>
          </span>
        </template>
      </div>
      <p class="text-sm text-gray-600 dark:text-brand-300">{{ modeDetails.description }}</p>
      <p class="text-xs text-gray-500 dark:text-brand-400 mt-2">
        The mode is set on the server (<span class="font-mono">POLICY_MODE</span>). This page and the step-up and
        change-password routes are never gated by the policy, so a bad rule can always be fixed here.
      </p>
    </div>

    <!-- Rules -->
    <div class="card overflow-hidden mb-6">
      <div class="p-6 pb-3 flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Rules</h3>
          <p class="text-xs text-gray-500 dark:text-brand-400">
            Deny overrides allow; with no applicable rule the answer is deny. A condition on a missing attribute is
            unknown: an unknown allow does not allow, an unknown deny denies.
          </p>
        </div>
        <Button v-if="!ed.editing.value" label="Edit rules" icon="pi pi-pencil" class="btn-primary" @click="ed.startEdit()" />
      </div>

      <DataTable v-if="!ed.editing.value" :value="ed.policy.value?.rules ?? []" responsiveLayout="scroll" class="p-datatable-sm">
        <Column field="id" header="Rule" style="min-width: 220px">
          <template #body="{ data }">
            <p class="text-sm font-mono font-medium text-gray-900 dark:text-white">{{ data.id }}</p>
            <p v-if="data.description" class="text-xs text-gray-500 dark:text-brand-400">{{ data.description }}</p>
          </template>
        </Column>
        <Column field="effect" header="Effect" style="width: 110px">
          <template #body="{ data }">
            <StatusBadge :status="data.effect === 'deny' ? 'error' : 'success'" :label="data.effect" />
          </template>
        </Column>
        <Column field="actions" header="Actions" style="min-width: 260px">
          <template #body="{ data }">
            <p v-for="a in data.actions.slice(0, 3)" :key="a" class="text-xs font-mono text-gray-700 dark:text-gray-300">{{ a }}</p>
            <p v-if="data.actions.length > 3" class="text-xs text-gray-500">+{{ data.actions.length - 3 }} more</p>
          </template>
        </Column>
        <Column header="Obligations" style="width: 170px">
          <template #body="{ data }">
            <span class="text-xs font-mono">{{ (data.obligations ?? []).join(', ') || '—' }}</span>
          </template>
        </Column>
        <Column header="" style="width: 100px">
          <template #body="{ data }">
            <StatusBadge v-if="data.disabled" status="neutral" label="disabled" />
          </template>
        </Column>
        <template #empty>
          <EmptyState icon="pi-sitemap" title="No rules" description="With no rules every request is denied once the policy is consulted." />
        </template>
      </DataTable>

      <!-- Editor -->
      <div v-else class="px-6 pb-6 space-y-4" data-test="editor">
        <p class="text-xs text-gray-500 dark:text-brand-400">
          Editing a copy of v{{ ed.policy.value?.version ?? 0 }}. Saving creates a new version; nothing is changed in
          place. Saving needs a recent sign-in — you will be asked to confirm it's you.
        </p>
        <Textarea
          v-model="ed.draftText.value"
          rows="22"
          class="w-full font-mono text-xs"
          spellcheck="false"
          aria-label="Rules (JSON)"
          data-test="draft"
          @update:modelValue="ed.onDraftChanged()"
        />
        <InputText v-model="ed.note.value" placeholder="Note for this version (what changed and why)" class="w-full" data-test="note" />

        <Message v-if="ed.parseError.value" severity="error" :closable="false">{{ ed.parseError.value }}</Message>
        <Message v-if="ed.validated.value" severity="success" :closable="false">The rule set is valid.</Message>
        <div v-if="ed.validationErrors.value.length" role="alert" class="rounded-lg border border-red-200 dark:border-red-900 p-4" data-test="validation-errors">
          <p class="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
            {{ ed.validationErrors.value.length }} problem{{ ed.validationErrors.value.length === 1 ? '' : 's' }} — nothing was saved
          </p>
          <ul class="space-y-1">
            <li v-for="(e, i) in ed.validationErrors.value" :key="i" class="text-xs font-mono text-red-700 dark:text-red-300">
              {{ e.rule }} · {{ e.path }} — {{ e.message }}
            </li>
          </ul>
        </div>
        <Message v-if="ed.conflict.value" severity="warn" :closable="false">
          Someone saved a newer version since you started editing. Reload it — your draft is kept — and re-apply your change.
          <Button label="Reload latest" icon="pi pi-refresh" class="p-button-text p-button-sm ml-2" data-test="reload" @click="ed.reloadKeepingDraft()" />
        </Message>
        <Message v-if="ed.writeError.value" severity="error" :closable="false">{{ ed.writeError.value }}</Message>

        <div class="flex gap-2">
          <Button label="Validate" icon="pi pi-check-circle" class="btn-secondary" data-test="validate" @click="ed.validate()" />
          <Button label="Save as new version" icon="pi pi-save" class="btn-primary" :loading="ed.saving.value" data-test="save" @click="onSave" />
          <Button label="Cancel" class="p-button-text" @click="ed.cancelEdit()" />
        </div>
      </div>
    </div>

    <!-- Simulator -->
    <div class="card p-6 mb-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">Simulate a decision</h3>
      <p class="text-xs text-gray-500 dark:text-brand-400 mb-4">
        What would this request get, and why — evaluated without touching traffic.
      </p>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-brand-300 mb-1" for="sim-action">Action</label>
            <InputText id="sim-action" v-model="ed.simAction.value" placeholder="DELETE /api/admin/apps/{id}" class="w-full font-mono text-sm" list="admin-actions" />
            <datalist id="admin-actions">
              <option v-for="a in ed.catalogue.value?.admin_actions ?? []" :key="a" :value="a" />
            </datalist>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-brand-300 mb-1" for="sim-principal">Principal (JSON)</label>
            <Textarea id="sim-principal" v-model="ed.simPrincipal.value" rows="7" class="w-full font-mono text-xs" spellcheck="false" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-brand-300 mb-1" for="sim-resource">Resource (JSON)</label>
              <Textarea id="sim-resource" v-model="ed.simResource.value" rows="3" class="w-full font-mono text-xs" spellcheck="false" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-brand-300 mb-1" for="sim-context">Context (JSON)</label>
              <Textarea id="sim-context" v-model="ed.simContext.value" rows="3" class="w-full font-mono text-xs" spellcheck="false" />
            </div>
          </div>
          <div class="flex items-center gap-3">
            <ToggleSwitch v-model="ed.simUseDraft.value" :disabled="!ed.editing.value" inputId="sim-draft" />
            <label for="sim-draft" class="text-sm text-gray-600 dark:text-brand-300">Against my unsaved draft</label>
          </div>
          <Button label="Simulate" icon="pi pi-play" class="btn-primary" :loading="ed.simulating.value" @click="ed.simulate()" />
          <Message v-if="ed.simError.value" severity="error" :closable="false">{{ ed.simError.value }}</Message>
        </div>

        <div v-if="ed.simResult.value" data-test="sim-result">
          <div class="flex items-center gap-2 mb-2">
            <StatusBadge :status="ed.simResult.value.decision.allow ? 'success' : 'error'" :label="ed.simResult.value.decision.allow ? 'Allow' : 'Deny'" />
            <span class="text-sm text-gray-700 dark:text-gray-300">{{ reasonLabel(ed.simResult.value.decision.reason) }}</span>
            <span v-if="ed.simResult.value.decision.rule" class="text-xs font-mono text-gray-500">({{ ed.simResult.value.decision.rule }})</span>
          </div>
          <p v-if="ed.simResult.value.decision.obligations?.length" class="text-xs text-gray-600 dark:text-brand-300 mb-2">
            Obligations: <span class="font-mono">{{ ed.simResult.value.decision.obligations.join(', ') }}</span>
          </p>
          <DataTable :value="ed.simResult.value.trace" class="p-datatable-sm" responsiveLayout="scroll">
            <Column field="rule" header="Rule"><template #body="{ data }"><span class="text-xs font-mono">{{ data.rule }}</span></template></Column>
            <Column field="effect" header="Effect" />
            <Column header="Applies">
              <template #body="{ data }">
                <span class="text-xs">{{ data.disabled ? 'disabled' : data.action_matched ? data.result : 'action does not match' }}</span>
              </template>
            </Column>
            <Column header="Missing">
              <template #body="{ data }"><span class="text-xs font-mono">{{ (data.missing_attributes ?? []).join(', ') }}</span></template>
            </Column>
          </DataTable>
        </div>
      </div>
    </div>

    <!-- Versions -->
    <div class="card overflow-hidden mb-6">
      <div class="p-6 pb-3">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">History</h3>
        <p class="text-xs text-gray-500 dark:text-brand-400">Restoring saves an old version's rules as a new version; history is never rewritten.</p>
      </div>
      <DataTable :value="ed.versions.value" class="p-datatable-sm" responsiveLayout="scroll">
        <Column field="version" header="Version" style="width: 100px">
          <template #body="{ data }"><span class="text-sm font-mono">v{{ data.version }}</span></template>
        </Column>
        <Column field="note" header="Note" style="min-width: 240px" />
        <Column field="rule_count" header="Rules" style="width: 90px" />
        <Column field="created_at" header="Saved" style="width: 190px">
          <template #body="{ data }"><span class="text-sm">{{ formatDateTime(data.created_at) }}</span></template>
        </Column>
        <Column header="" style="width: 120px">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button icon="pi pi-eye" class="p-button-text p-button-sm" v-tooltip.top="'View'" @click="openVersion(data.version)" />
              <Button
                v-if="data.version !== ed.policy.value?.version"
                icon="pi pi-replay"
                class="p-button-text p-button-sm"
                v-tooltip.top="'Restore'"
                @click="confirmRestore(data.version)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Recent decisions -->
    <div class="card overflow-hidden mb-6">
      <div class="p-6 pb-3 flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Recent denials and divergences</h3>
          <p class="text-xs text-gray-500 dark:text-brand-400">
            Watch a new rule here in shadow mode before enforcing it. The full log is in the monitoring console.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <ToggleSwitch v-model="ed.divergenceOnly.value" inputId="div-only" @update:modelValue="ed.loadDecisions()" />
          <label for="div-only" class="text-sm text-gray-600 dark:text-brand-300">Divergences only</label>
        </div>
      </div>
      <DataTable :value="ed.decisions.value" class="p-datatable-sm" responsiveLayout="scroll">
        <Column field="created_at" header="Time" style="width: 170px">
          <template #body="{ data }"><span class="text-xs">{{ formatDateTime(data.created_at) }}</span></template>
        </Column>
        <Column field="action" header="Action" style="min-width: 220px">
          <template #body="{ data }"><span class="text-xs font-mono">{{ data.action }}</span></template>
        </Column>
        <Column header="Outcome" style="width: 110px">
          <template #body="{ data }">
            <StatusBadge :status="data.allow ? 'success' : data.enforced ? 'error' : 'warning'" :label="data.allow ? 'allow' : data.enforced ? 'refused' : 'would deny'" />
          </template>
        </Column>
        <Column header="Why" style="min-width: 220px">
          <template #body="{ data }">
            <p class="text-xs">{{ reasonLabel(data.reason) }}<span v-if="data.rule" class="font-mono"> ({{ data.rule }})</span></p>
            <p v-if="data.divergence" class="text-xs text-amber-600">{{ divergenceLabel(data.divergence) }}</p>
          </template>
        </Column>
        <Column field="correlation_id" header="Correlation" style="width: 200px">
          <template #body="{ data }"><span class="text-xs font-mono">{{ data.correlation_id }}</span></template>
        </Column>
        <template #empty>
          <EmptyState icon="pi-check-circle" title="Nothing to report" description="No denials or divergences recorded." />
        </template>
      </DataTable>
    </div>

    <!-- Reference -->
    <details v-if="ed.catalogue.value" class="card p-6">
      <summary class="text-lg font-semibold text-gray-900 dark:text-white cursor-pointer">Reference</summary>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4 text-xs font-mono">
        <div>
          <p class="font-sans font-semibold mb-1">Attributes</p>
          <p v-for="a in ed.catalogue.value.attributes" :key="a">{{ a }}</p>
          <p v-for="a in ed.catalogue.value.attribute_maps" :key="a">{{ a }}</p>
        </div>
        <div>
          <p class="font-sans font-semibold mb-1">Operators</p>
          <p>{{ ed.catalogue.value.operators.join(', ') }}</p>
          <p class="font-sans font-semibold mt-3 mb-1">Obligations</p>
          <p v-for="o in ed.catalogue.value.obligations" :key="o">{{ o }}</p>
        </div>
        <div>
          <p class="font-sans font-semibold mb-1">Admin actions ({{ ed.catalogue.value.admin_actions.length }})</p>
          <p v-for="a in ed.catalogue.value.admin_actions" :key="a">{{ a }}</p>
          <p class="font-sans font-semibold mt-3 mb-1">Never gated</p>
          <p v-for="a in ed.catalogue.value.exempt_actions" :key="a">{{ a }}</p>
        </div>
      </div>
    </details>

    <Dialog v-model:visible="versionDialog" modal :header="`Version v${shownVersion?.version ?? ''}`" class="w-full max-w-3xl">
      <pre class="text-xs font-mono whitespace-pre-wrap max-h-[60vh] overflow-auto">{{ shownVersion ? formatRules(shownVersion.rules) : '' }}</pre>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Message from 'primevue/message'
import PageHeader from '@/components/ui/PageHeader.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useToast } from '@/composables/useToast'
import { useConfirmDialog } from '@/composables/useConfirm'
import { usePolicyEditor } from '@/composables/usePolicyEditor'
import { formatDateTime } from '@/utils/formatDate'
import { modeInfo, reasonLabel, divergenceLabel, formatRules } from '@/utils/policy'
import type { PolicyVersion } from '@/types/policy'

const ed = usePolicyEditor()
const toast = useToast()
const { confirmAction } = useConfirmDialog()

const modeDetails = computed(() => modeInfo(ed.mode.value))

const versionDialog = ref(false)
const shownVersion = ref<PolicyVersion | null>(null)

async function openVersion(version: number) {
  try {
    shownVersion.value = await ed.viewVersion(version)
    versionDialog.value = true
  } catch {
    toast.error('Failed to load that version')
  }
}

async function onSave() {
  const outcome = await ed.save()
  if (outcome === 'saved') toast.success('Policy saved', `Now at v${ed.policy.value?.version}`)
}

function confirmRestore(version: number) {
  confirmAction({
    header: `Restore v${version}?`,
    message: `Version ${version}'s rules will be saved as a new version and take effect immediately in the current mode (${ed.mode.value}).`,
    icon: 'pi pi-replay',
    acceptLabel: 'Restore',
    onConfirm: async () => {
      const outcome = await ed.restore(version)
      if (outcome === 'saved') toast.success('Version restored', `Now at v${ed.policy.value?.version}`)
      else if (outcome === 'conflict') toast.warn('Someone saved a newer version', 'Refresh and try again.')
      else if (outcome === 'error') toast.error('Restore failed', ed.writeError.value ?? undefined)
    },
  })
}

onMounted(() => { void ed.load() })
</script>
