/**
 * State and actions behind the policy editor (A4). The view is a thin
 * template over this, so every flow — load, edit, validate, save with its
 * conflict and validation outcomes, restore, simulate — is testable against
 * MSW without mounting PrimeVue.
 */
import { ref, computed } from 'vue'
import axios from 'axios'
import * as policyService from '@/services/policyService'
import { getErrorMessage } from '@/services/api'
import { ElevationCancelled, challengeCode } from '@/services/adminGuards'
import { parseRules, parseObject, formatRules, SAMPLE_PRINCIPAL } from '@/utils/policy'
import type {
  PolicyVersion,
  PolicyVersionSummary,
  PolicyCatalogue,
  PolicyValidationError,
  PolicySimulation,
  PolicyDecisionRecord,
  PolicyRule,
} from '@/types/policy'

/** What happened to the last save or restore, for the view to report. */
export type WriteOutcome = 'saved' | 'invalid' | 'conflict' | 'cancelled' | 'error'

function responseStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined
}

function validationErrorsOf(err: unknown): PolicyValidationError[] {
  if (!axios.isAxiosError(err)) return []
  const errors = (err.response?.data as { errors?: PolicyValidationError[] } | undefined)?.errors
  return Array.isArray(errors) ? errors : []
}

export function usePolicyEditor() {
  // ── Loaded state ─────────────────────────────────────────────────────────
  const loading   = ref(false)
  const loadError = ref<string | null>(null)
  const policy    = ref<PolicyVersion | null>(null)
  const catalogue = ref<PolicyCatalogue | null>(null)
  const versions  = ref<PolicyVersionSummary[]>([])
  const decisions = ref<PolicyDecisionRecord[]>([])
  const divergenceOnly = ref(false)

  const mode = computed(() => policy.value?.mode ?? catalogue.value?.mode ?? 'off')

  // ── Editing ──────────────────────────────────────────────────────────────
  const editing          = ref(false)
  const draftText        = ref('')
  const note             = ref('')
  const parseError       = ref<string | null>(null)
  const validationErrors = ref<PolicyValidationError[]>([])
  const validated        = ref(false)
  const saving           = ref(false)
  const conflict         = ref(false)
  const writeError       = ref<string | null>(null)

  // ── Simulation ───────────────────────────────────────────────────────────
  const simAction        = ref('')
  const simPrincipal     = ref(SAMPLE_PRINCIPAL)
  const simResource      = ref('{}')
  const simContext       = ref('{}')
  const simUseDraft      = ref(false)
  const simulating       = ref(false)
  const simError         = ref<string | null>(null)
  const simResult        = ref<PolicySimulation | null>(null)

  async function load(): Promise<void> {
    loading.value = true
    loadError.value = null
    try {
      const [p, c, v] = await Promise.all([
        policyService.getPolicy(),
        policyService.getCatalogue(),
        policyService.listVersions(),
      ])
      policy.value = p
      catalogue.value = c
      versions.value = v
      await loadDecisions()
    } catch (err) {
      loadError.value = responseStatus(err) === 404
        ? 'No policy version is stored yet. Save a rule set to create version 1.'
        : getErrorMessage(err)
    } finally {
      loading.value = false
    }
  }

  async function loadDecisions(): Promise<void> {
    decisions.value = await policyService.getDecisions({ divergence: divergenceOnly.value })
  }

  function startEdit(): void {
    draftText.value = formatRules(policy.value?.rules ?? [])
    note.value = ''
    resetDraftFeedback()
    editing.value = true
  }

  function cancelEdit(): void {
    editing.value = false
    resetDraftFeedback()
  }

  function resetDraftFeedback(): void {
    parseError.value = null
    validationErrors.value = []
    validated.value = false
    conflict.value = false
    writeError.value = null
  }

  /** Called on every edit: a validated result no longer describes the text. */
  function onDraftChanged(): void {
    validated.value = false
    parseError.value = null
  }

  function parsedDraft(): PolicyRule[] | null {
    const parsed = parseRules(draftText.value)
    if (!parsed.ok) {
      parseError.value = parsed.error
      return null
    }
    parseError.value = null
    return parsed.value
  }

  async function validate(): Promise<boolean> {
    const rules = parsedDraft()
    if (!rules) return false
    validationErrors.value = []
    try {
      await policyService.validatePolicy(rules)
      validated.value = true
      return true
    } catch (err) {
      validated.value = false
      const errors = validationErrorsOf(err)
      if (errors.length > 0) validationErrors.value = errors
      else writeError.value = getErrorMessage(err)
      return false
    }
  }

  async function save(): Promise<WriteOutcome> {
    const rules = parsedDraft()
    if (!rules) return 'invalid'
    saving.value = true
    validationErrors.value = []
    conflict.value = false
    writeError.value = null
    try {
      policy.value = await policyService.savePolicy(policy.value?.version ?? 0, rules, note.value)
      editing.value = false
      await refreshHistory()
      return 'saved'
    } catch (err) {
      return writeFailure(err)
    } finally {
      saving.value = false
    }
  }

  async function restore(version: number): Promise<WriteOutcome> {
    saving.value = true
    writeError.value = null
    conflict.value = false
    try {
      policy.value = await policyService.restoreVersion(version, policy.value?.version ?? 0)
      editing.value = false
      await refreshHistory()
      return 'saved'
    } catch (err) {
      return writeFailure(err)
    } finally {
      saving.value = false
    }
  }

  function writeFailure(err: unknown): WriteOutcome {
    // Dismissing the step-up prompt surfaces the original 403 (see api.ts).
    if (err instanceof ElevationCancelled || challengeCode(err) === 'elevation_required') return 'cancelled'
    const status = responseStatus(err)
    if (status === 422) {
      validationErrors.value = validationErrorsOf(err)
      return 'invalid'
    }
    if (status === 409) {
      // Someone saved since this version was loaded. Keep the draft: the
      // admin reloads, then re-applies their change deliberately.
      conflict.value = true
      return 'conflict'
    }
    writeError.value = getErrorMessage(err)
    return 'error'
  }

  /**
   * Reload the current version after a conflict, keeping the draft text so
   * the admin's change is not lost.
   */
  async function reloadKeepingDraft(): Promise<void> {
    policy.value = await policyService.getPolicy()
    conflict.value = false
    await refreshHistory()
  }

  async function refreshHistory(): Promise<void> {
    versions.value = await policyService.listVersions()
  }

  async function viewVersion(version: number): Promise<PolicyVersion> {
    return policyService.getVersion(version)
  }

  async function simulate(): Promise<void> {
    simError.value = null
    simResult.value = null
    const principal = parseObject(simPrincipal.value, 'Principal')
    if (!principal.ok) { simError.value = principal.error; return }
    const resource = parseObject(simResource.value, 'Resource')
    if (!resource.ok) { simError.value = resource.error; return }
    const context = parseObject(simContext.value, 'Context')
    if (!context.ok) { simError.value = context.error; return }
    if (!simAction.value.trim()) {
      simError.value = 'Enter the action to simulate, e.g. DELETE /api/admin/apps/{id}.'
      return
    }
    let rules: PolicyRule[] | undefined
    if (simUseDraft.value && editing.value) {
      const draft = parsedDraft()
      if (!draft) {
        simError.value = 'The draft rules are not valid JSON.'
        return
      }
      rules = draft
    }
    simulating.value = true
    try {
      simResult.value = await policyService.simulatePolicy({
        principal: principal.value,
        action:    simAction.value.trim(),
        resource:  resource.value,
        context:   context.value,
      }, rules)
    } catch (err) {
      const errors = validationErrorsOf(err)
      simError.value = errors.length > 0
        ? `The draft is invalid: ${errors.map(e => `${e.rule} ${e.path}: ${e.message}`).join('; ')}`
        : getErrorMessage(err)
    } finally {
      simulating.value = false
    }
  }

  return {
    // state
    loading, loadError, policy, catalogue, versions, decisions, divergenceOnly, mode,
    editing, draftText, note, parseError, validationErrors, validated, saving, conflict, writeError,
    simAction, simPrincipal, simResource, simContext, simUseDraft, simulating, simError, simResult,
    // actions
    load, loadDecisions, startEdit, cancelEdit, onDraftChanged, validate, save, restore,
    reloadKeepingDraft, viewVersion, simulate,
  }
}
