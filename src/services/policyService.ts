import api from './api'
import type {
  PolicyVersion,
  PolicyVersionSummary,
  PolicyRule,
  PolicyCatalogue,
  PolicyInput,
  PolicySimulation,
  PolicyDecisionRecord,
} from '@/types/policy'

// ============================================================================
// Policy administration — /api/admin/policy (superadmin only, A4)
// Writes need fresh step-up; the api interceptor handles elevation_required.
// ============================================================================

/** GET /api/admin/policy — the current version and the mode it runs under. */
export async function getPolicy(): Promise<PolicyVersion> {
  const response = await api.get<PolicyVersion>('/api/admin/policy')
  return response.data
}

/**
 * PUT /api/admin/policy — save a new version. baseVersion must be the version
 * the editor loaded: 409 if someone saved in between, 422 with every problem
 * listed if the rules are invalid.
 */
export async function savePolicy(baseVersion: number, rules: PolicyRule[], note: string): Promise<PolicyVersion> {
  const response = await api.put<PolicyVersion>('/api/admin/policy', { base_version: baseVersion, rules, note })
  return response.data
}

/** POST /api/admin/policy/validate — check a draft without saving (422 if invalid). */
export async function validatePolicy(rules: PolicyRule[]): Promise<void> {
  await api.post('/api/admin/policy/validate', { rules })
}

/**
 * POST /api/admin/policy/simulate — evaluate an input with a per-rule trace,
 * against the draft rules when given, otherwise the current version.
 */
export async function simulatePolicy(input: PolicyInput, rules?: PolicyRule[]): Promise<PolicySimulation> {
  const response = await api.post<PolicySimulation>('/api/admin/policy/simulate', rules ? { input, rules } : { input })
  return response.data
}

/** GET /api/admin/policy/catalogue — every admin action, attribute, operator and obligation. */
export async function getCatalogue(): Promise<PolicyCatalogue> {
  const response = await api.get<PolicyCatalogue>('/api/admin/policy/catalogue')
  return response.data
}

/** GET /api/admin/policy/versions — newest first. */
export async function listVersions(limit = 50): Promise<PolicyVersionSummary[]> {
  const response = await api.get<{ versions: PolicyVersionSummary[] }>('/api/admin/policy/versions', { params: { limit } })
  return response.data.versions
}

/** GET /api/admin/policy/versions/{v} */
export async function getVersion(version: number): Promise<PolicyVersion> {
  const response = await api.get<PolicyVersion>(`/api/admin/policy/versions/${version}`)
  return response.data
}

/** POST /api/admin/policy/versions/{v}/restore — saved forward as a new version. */
export async function restoreVersion(version: number, baseVersion: number): Promise<PolicyVersion> {
  const response = await api.post<PolicyVersion>(`/api/admin/policy/versions/${version}/restore`, { base_version: baseVersion })
  return response.data
}

/** GET /api/admin/policy/decisions — recent denials and divergences, newest first. */
export async function getDecisions(params: { divergence?: boolean; limit?: number } = {}): Promise<PolicyDecisionRecord[]> {
  const response = await api.get<{ decisions: PolicyDecisionRecord[] }>('/api/admin/policy/decisions', {
    params: {
      limit: params.limit ?? 50,
      ...(params.divergence ? { divergence: 'true' } : {}),
    },
  })
  return response.data.decisions
}
