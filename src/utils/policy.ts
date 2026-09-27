/**
 * Pure helpers for the policy editor (A4). No I/O: everything here is
 * unit-tested directly.
 */
import type { PolicyMode, PolicyRule } from '@/types/policy'

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * Parse the editor's text as a rule set. Only the shape is checked here — a
 * JSON array of objects — everything else is left to the server, whose
 * validator reports every problem with its exact path.
 */
export function parseRules(text: string): ParseResult<PolicyRule[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` }
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'The rule set must be a JSON array of rules.' }
  }
  if (parsed.some((r) => r === null || typeof r !== 'object' || Array.isArray(r))) {
    return { ok: false, error: 'Every rule must be a JSON object.' }
  }
  return { ok: true, value: parsed as PolicyRule[] }
}

/** Parse a JSON object field of the simulator (principal, resource, context). */
export function parseObject(text: string, label: string): ParseResult<Record<string, unknown>> {
  if (text.trim() === '') return { ok: true, value: {} }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `${label}: not valid JSON (${(e as Error).message})` }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: `${label}: must be a JSON object` }
  }
  return { ok: true, value: parsed as Record<string, unknown> }
}

/** The editor's text form of a rule set. */
export function formatRules(rules: PolicyRule[]): string {
  return JSON.stringify(rules, null, 2)
}

export interface ModeInfo {
  label:       string
  status:      'neutral' | 'warning' | 'success'
  description: string
}

/** What each POLICY_MODE means for the admin API, in words an operator can act on. */
export function modeInfo(mode: PolicyMode | string): ModeInfo {
  switch (mode) {
    case 'shadow':
      return {
        label: 'Shadow',
        status: 'warning',
        description: 'Every admin request is evaluated and compared with the built-in checks. Nothing is refused: would-be denials and disagreements go to the decision log.',
      }
    case 'enforce':
      return {
        label: 'Enforce',
        status: 'success',
        description: 'A policy deny is refused with 403. An allow still has to pass every built-in check, so the policy can only remove access.',
      }
    default:
      return {
        label: 'Off',
        status: 'neutral',
        description: 'The policy is not consulted. Rules can be written, validated and simulated here before shadowing.',
      }
  }
}

const REASONS: Record<string, string> = {
  allowed_by_rule:         'Allowed by rule',
  denied_by_rule:          'Denied by rule',
  deny_rule_indeterminate: 'Denied — a deny rule could not be evaluated (missing attribute)',
  no_applicable_rule:      'Denied — no rule applies (default deny)',
  policy_unavailable:      'No policy could be loaded',
  subject_locked:          'Denied — the account is locked',
}

/** A decision reason in words; obligation_unmet:<name> keeps its obligation. */
export function reasonLabel(reason: string): string {
  if (reason.startsWith('obligation_unmet:')) {
    return `Denied — obligation not met (${reason.slice('obligation_unmet:'.length)})`
  }
  return REASONS[reason] ?? reason
}

const DIVERGENCES: Record<string, string> = {
  pdp_deny_code_allow: 'Policy stricter than the built-in checks',
  pdp_allow_code_deny: 'Policy looser than the built-in checks',
}

export function divergenceLabel(kind?: string): string {
  if (!kind) return ''
  return DIVERGENCES[kind] ?? kind
}

/** A starting point for the simulator's principal field. */
export const SAMPLE_PRINCIPAL = JSON.stringify(
  { kind: 'user', id: 1, role: 'admin', scopes: ['openid', 'admin'], amr: ['pwd'] },
  null,
  2,
)
