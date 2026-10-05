/**
 * Unit tests for the token-settings helpers: they must check what Socrate
 * checks (closed claim sources, claim names, scopes, lifetime, attribute
 * limits), so a mistake shows next to the field rather than as a 400.
 */
import { describe, it, expect } from 'vitest'
import {
  attributesToRows,
  claimNameError,
  mappingsToRows,
  parseList,
  rowsToAttributes,
  rowsToMappings,
  sameList,
  sameMappings,
  sourceError,
  ttlError,
  unsupportedScopes,
} from '@/utils/tokenSettings'

describe('parseList / sameList', () => {
  it('splits on spaces, commas and new lines, without empties or duplicates', () => {
    expect(parseList(' lakebridge-console, lakebridge-portal\nlakebridge-console  ')).toEqual(['lakebridge-console', 'lakebridge-portal'])
    expect(parseList('')).toEqual([])
  })

  it('compares in order, absent equal to empty', () => {
    expect(sameList(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameList(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(sameList([], undefined)).toBe(true)
  })
})

describe('scopes and lifetime', () => {
  it('flags the scopes Socrate does not support', () => {
    expect(unsupportedScopes(['openid', 'email', 'admin'])).toEqual(['admin'])
  })

  it('accepts 60 to 86400 whole seconds, or nothing', () => {
    expect(ttlError(null)).toBe('')
    expect(ttlError(60)).toBe('')
    expect(ttlError(86400)).toBe('')
    expect(ttlError(59)).not.toBe('')
    expect(ttlError(86401)).not.toBe('')
    expect(ttlError(90.5)).not.toBe('')
  })
})

describe('claim mappings', () => {
  it('accepts the closed source set only', () => {
    for (const ok of ['user.email', 'user.name', 'user.id', 'app_role', 'app.id', 'app.client_id', 'user.attributes.tenant_id', 'literal:acme']) {
      expect(sourceError(ok), ok).toBe('')
    }
    for (const bad of ['', 'user.attributes.', 'user.password', 'env:SECRET']) {
      expect(sourceError(bad), bad).not.toBe('')
    }
  })

  it('refuses empty, long, spaced or quoted claim names', () => {
    expect(claimNameError('tenant_id')).toBe('')
    expect(claimNameError('')).not.toBe('')
    expect(claimNameError('a'.repeat(65))).not.toBe('')
    expect(claimNameError('tenant id')).not.toBe('')
    expect(claimNameError('ten"ant')).not.toBe('')
  })

  it('round-trips both JSON forms, sorted by name, with the shorthand for access tokens', () => {
    const rows = mappingsToRows({
      tenant_id: 'user.attributes.tenant_id',
      dept: { source: 'user.attributes.dept', target: 'both' },
      tier: { source: 'literal:gold' },
    })
    expect(rows).toEqual([
      { name: 'dept', source: 'user.attributes.dept', target: 'both' },
      { name: 'tenant_id', source: 'user.attributes.tenant_id', target: 'access' },
      { name: 'tier', source: 'literal:gold', target: 'access' },
    ])
    const { mappings, errors } = rowsToMappings(rows)
    expect(errors).toEqual({})
    expect(mappings).toEqual({
      dept: { source: 'user.attributes.dept', target: 'both' },
      tenant_id: 'user.attributes.tenant_id',
      tier: 'literal:gold',
    })
  })

  it('ignores blank rows and reports bad ones by index', () => {
    const { mappings, errors } = rowsToMappings([
      { name: '', source: '', target: 'access' },
      { name: 'tenant_id', source: 'user.attributes.tenant_id', target: 'access' },
      { name: 'tenant_id', source: 'user.id', target: 'access' },
      { name: 'x', source: 'user.password', target: 'access' },
    ])
    expect(mappings).toEqual({ tenant_id: 'user.attributes.tenant_id' })
    expect(Object.keys(errors)).toEqual(['2', '3'])
  })

  it('treats the shorthand as target access when comparing', () => {
    expect(sameMappings({ a: 'user.id' }, { a: { source: 'user.id', target: 'access' } })).toBe(true)
    expect(sameMappings({ a: 'user.id' }, { a: { source: 'user.id', target: 'both' } })).toBe(false)
    expect(sameMappings({}, undefined)).toBe(true)
  })
})

describe('user attributes', () => {
  it('edits strings as text and everything else as JSON, and keeps the types on save', () => {
    const rows = attributesToRows({ tenant_id: '0b6f…', seats: 12, flags: { beta: true } })
    expect(rows).toEqual([
      { name: 'flags', value: '{"beta":true}', json: true },
      { name: 'seats', value: '12', json: true },
      { name: 'tenant_id', value: '0b6f…', json: false },
    ])
    const { attributes, errors, error } = rowsToAttributes(rows)
    expect(errors).toEqual({})
    expect(error).toBe('')
    expect(attributes).toEqual({ tenant_id: '0b6f…', seats: 12, flags: { beta: true } })
  })

  it('reports a missing name, a duplicate and invalid JSON by row', () => {
    const { attributes, errors } = rowsToAttributes([
      { name: '', value: 'orphan', json: false },
      { name: 'a', value: '1', json: false },
      { name: 'a', value: '2', json: false },
      { name: 'b', value: '{nope', json: true },
      { name: '', value: '  ', json: false },
    ])
    expect(attributes).toEqual({ a: '1' })
    expect(Object.keys(errors)).toEqual(['0', '2', '3'])
  })

  it('enforces Socrate limits: 32 attributes and 4096 bytes', () => {
    const many = Array.from({ length: 33 }, (_, i) => ({ name: `k${i}`, value: 'v', json: false }))
    expect(rowsToAttributes(many).error).toMatch(/32/)
    expect(rowsToAttributes([{ name: 'big', value: 'x'.repeat(5000), json: false }]).error).toMatch(/4096/)
    expect(rowsToAttributes([{ name: 'n'.repeat(65), value: 'v', json: false }]).errors[0]).toMatch(/64/)
  })
})
