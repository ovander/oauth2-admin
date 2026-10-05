// Helpers for the token settings of an application (audiences, allowed scopes,
// claim mappings, access-token lifetime) and for a user's attributes. They turn
// the API shapes into editable rows and back, and check what Socrate checks, so
// a mistake shows next to the field instead of as a 400 after saving. Socrate
// validates again on write.

import type { ClaimMapping, ClaimMappings, ClaimTarget } from '@/types/application'

/** Scopes Socrate supports (discovery `scopes_supported`). */
export const SUPPORTED_SCOPES = ['openid', 'email', 'profile', 'offline_access', 'api'] as const

/** Bounds of access_token_ttl_seconds; Socrate's ACCESS_TOKEN_TTL stays the maximum. */
export const TTL_MIN = 60
export const TTL_MAX = 86400

/** Socrate's limits on claim names and user attributes. */
export const MAX_CLAIM_NAME = 64
export const MAX_ATTRIBUTES = 32
export const MAX_ATTRIBUTE_NAME = 64
export const MAX_ATTRIBUTES_BYTES = 4096

/** The fixed claim sources; user.attributes.<key> and literal:<value> complete the set. */
export const FIXED_SOURCES = ['user.email', 'user.name', 'user.id', 'app_role', 'app.id', 'app.client_id'] as const

export interface ClaimRow {
  name: string
  source: string
  target: ClaimTarget
}

/** parseList splits on whitespace and commas, trims, and drops empties and duplicates. */
export function parseList(text: string): string[] {
  const out: string[] = []
  for (const item of text.split(/[\s,]+/)) {
    if (item && !out.includes(item)) out.push(item)
  }
  return out
}

/** sameList reports whether two lists hold the same values in the same order. */
export function sameList(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const x = a ?? []
  const y = b ?? []
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** unsupportedScopes returns the scopes Socrate would refuse. */
export function unsupportedScopes(scopes: readonly string[]): string[] {
  return scopes.filter(s => !(SUPPORTED_SCOPES as readonly string[]).includes(s))
}

/** ttlError returns why a lifetime is refused, or '' (null means the server default). */
export function ttlError(ttl: number | null | undefined): string {
  if (ttl === null || ttl === undefined) return ''
  if (!Number.isInteger(ttl) || ttl < TTL_MIN || ttl > TTL_MAX) {
    return `Between ${TTL_MIN} and ${TTL_MAX} seconds, or empty for the server default.`
  }
  return ''
}

/** mappingsToRows lists the mappings sorted by claim name, as Socrate issues them. */
export function mappingsToRows(m: ClaimMappings | undefined): ClaimRow[] {
  return Object.keys(m ?? {}).sort().map(name => {
    const v = (m as ClaimMappings)[name]
    return typeof v === 'string'
      ? { name, source: v, target: 'access' as ClaimTarget }
      : { name, source: v.source, target: v.target ?? 'access' }
  })
}

/** sourceError returns why Socrate would refuse a claim source, or ''. */
export function sourceError(source: string): string {
  if (!source) return 'A source is required.'
  if ((FIXED_SOURCES as readonly string[]).includes(source)) return ''
  if (source.startsWith('user.attributes.')) {
    return source.length > 'user.attributes.'.length ? '' : 'Name the attribute: user.attributes.<name>.'
  }
  if (source.startsWith('literal:')) return ''
  return `Unsupported source. Use ${FIXED_SOURCES.join(', ')}, user.attributes.<name> or literal:<value>.`
}

/** claimNameError returns why Socrate would refuse a claim name, or ''. */
export function claimNameError(name: string): string {
  if (!name) return 'A claim name is required.'
  if (name.length > MAX_CLAIM_NAME) return `At most ${MAX_CLAIM_NAME} characters.`
  if (/[\s"]/.test(name)) return 'No spaces or quotes.'
  return ''
}

/**
 * rowsToMappings builds the claim_mappings value from the rows (blank rows are
 * ignored). The string shorthand is used for target "access". errors is keyed
 * by row index.
 */
export function rowsToMappings(rows: readonly ClaimRow[]): { mappings: ClaimMappings; errors: Record<number, string> } {
  const mappings: ClaimMappings = {}
  const errors: Record<number, string> = {}
  rows.forEach((row, i) => {
    const name = row.name.trim()
    const source = row.source.trim()
    if (!name && !source) return
    const err = claimNameError(name) || sourceError(source) || (name in mappings ? 'This claim name is already mapped.' : '')
    if (err) {
      errors[i] = err
      return
    }
    const mapping: ClaimMapping = row.target === 'access' ? source : { source, target: row.target }
    mappings[name] = mapping
  })
  return { mappings, errors }
}

/** sameMappings compares two mapping sets, the string shorthand equal to target "access". */
export function sameMappings(a: ClaimMappings | undefined, b: ClaimMappings | undefined): boolean {
  const x = mappingsToRows(a)
  const y = mappingsToRows(b)
  return x.length === y.length &&
    x.every((r, i) => r.name === y[i].name && r.source === y[i].source && r.target === y[i].target)
}

export interface AttributeRow {
  name: string
  value: string
  // json: the value is edited as JSON (a number, boolean, list or object kept as such).
  json: boolean
}

/** attributesToRows lists the attributes sorted by name; non-string values are edited as JSON. */
export function attributesToRows(attrs: Record<string, unknown> | undefined): AttributeRow[] {
  return Object.keys(attrs ?? {}).sort().map(name => {
    const v = (attrs as Record<string, unknown>)[name]
    return typeof v === 'string'
      ? { name, value: v, json: false }
      : { name, value: JSON.stringify(v), json: true }
  })
}

/**
 * rowsToAttributes builds the attribute set from the rows (blank rows are
 * ignored) and checks Socrate's limits. errors is keyed by row index; error is
 * for the set as a whole.
 */
export function rowsToAttributes(rows: readonly AttributeRow[]): {
  attributes: Record<string, unknown>
  errors: Record<number, string>
  error: string
} {
  const attributes: Record<string, unknown> = {}
  const errors: Record<number, string> = {}
  rows.forEach((row, i) => {
    const name = row.name.trim()
    if (!name && !row.value.trim()) return
    if (!name) { errors[i] = 'A name is required.'; return }
    if (name.length > MAX_ATTRIBUTE_NAME) { errors[i] = `At most ${MAX_ATTRIBUTE_NAME} characters.`; return }
    if (name in attributes) { errors[i] = 'This name is already used.'; return }
    if (row.json) {
      try {
        attributes[name] = JSON.parse(row.value)
      } catch {
        errors[i] = 'Not valid JSON.'
      }
      return
    }
    attributes[name] = row.value
  })
  let error = ''
  if (Object.keys(attributes).length > MAX_ATTRIBUTES) {
    error = `At most ${MAX_ATTRIBUTES} attributes.`
  } else if (new TextEncoder().encode(JSON.stringify(attributes)).length > MAX_ATTRIBUTES_BYTES) {
    error = `The attributes exceed ${MAX_ATTRIBUTES_BYTES} bytes.`
  }
  return { attributes, errors, error }
}
