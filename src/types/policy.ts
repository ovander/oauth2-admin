/**
 * Types for Socrate's policy decision point (A4) — mirrors go-oauth2's
 * internal/policy and the /api/admin/policy API (docs/EXTENSIBILITY.md).
 */

export type PolicyMode = 'off' | 'shadow' | 'enforce'
export type PolicyEffect = 'allow' | 'deny'

/** A node of a rule's condition tree: exactly one shape is set. */
export interface PolicyCondition {
  all?:   PolicyCondition[]
  any?:   PolicyCondition[]
  not?:   PolicyCondition
  attr?:  string
  op?:    string
  value?: unknown
  ref?:   string
}

export interface PolicyRule {
  id:           string
  description?: string
  effect:       PolicyEffect
  actions:      string[]
  when?:        PolicyCondition
  obligations?: string[]
  disabled?:    boolean
}

/** GET /api/admin/policy, PUT /api/admin/policy, GET …/versions/{v}. */
export interface PolicyVersion {
  version:     number
  rules:       PolicyRule[]
  note?:       string
  created_by?: number
  created_at:  string
  mode:        PolicyMode
}

export interface PolicyVersionSummary {
  version:     number
  note?:       string
  created_by?: number
  created_at:  string
  rule_count:  number
}

/** One problem in a rule set, as returned with 422 invalid_policy. */
export interface PolicyValidationError {
  rule:    string
  path:    string
  message: string
}

export interface PolicyCatalogue {
  mode:           PolicyMode
  admin_actions:  string[]
  exempt_actions: string[]
  attributes:     string[]
  attribute_maps: string[]
  operators:      string[]
  obligations:    string[]
}

export interface PolicyInput {
  principal: Record<string, unknown>
  app?:      Record<string, unknown>
  action:    string
  resource?: Record<string, unknown>
  context?:  Record<string, unknown>
}

export interface PolicyDecision {
  allow:          boolean
  rule?:          string
  reason:         string
  obligations?:   string[]
  policy_version: number
}

export interface PolicyTraceEntry {
  rule:                string
  effect:              PolicyEffect
  action_matched:      boolean
  disabled?:           boolean
  result?:             'true' | 'false' | 'unknown'
  missing_attributes?: string[]
}

export interface PolicySimulation {
  decision: PolicyDecision
  trace:    PolicyTraceEntry[]
}

/** One decision-log row (denials and divergences only). */
export interface PolicyDecisionRecord {
  id:              number
  created_at:      string
  correlation_id?: string
  source:          string
  mode:            string
  enforced:        boolean
  allow:           boolean
  divergence?:     string
  action:          string
  rule?:           string
  reason:          string
  policy_version:  number
  principal_kind?: string
  principal_id?:   number
  client_id?:      string
  resource_type?:  string
  resource_id?:    string
  ip_address?:     string
  status_code?:    number
}
