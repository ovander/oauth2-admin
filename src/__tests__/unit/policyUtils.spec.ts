import { describe, it, expect } from 'vitest'
import { parseRules, parseObject, formatRules, modeInfo, reasonLabel, divergenceLabel } from '@/utils/policy'

describe('parseRules', () => {
  it('accepts an array of rule objects', () => {
    const r = parseRules('[{"id":"a","effect":"allow","actions":["*"]}]')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value[0].id).toBe('a')
  })
  it('accepts an empty rule set', () => {
    expect(parseRules('[]').ok).toBe(true)
  })
  it('rejects invalid JSON with the parser message', () => {
    const r = parseRules('[{')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Not valid JSON/)
  })
  it('rejects a non-array', () => {
    const r = parseRules('{"id":"a"}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/array/)
  })
  it('rejects non-object entries', () => {
    for (const text of ['[1]', '[null]', '[[]]', '["x"]']) {
      expect(parseRules(text).ok).toBe(false)
    }
  })
})

describe('parseObject', () => {
  it('treats blank as an empty object', () => {
    const r = parseObject('  ', 'Resource')
    expect(r).toEqual({ ok: true, value: {} })
  })
  it('parses an object', () => {
    expect(parseObject('{"ip":"10.0.0.1"}', 'Context')).toEqual({ ok: true, value: { ip: '10.0.0.1' } })
  })
  it('names the field on a JSON error', () => {
    const r = parseObject('{', 'Principal')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/^Principal: not valid JSON/)
  })
  it('rejects arrays and scalars', () => {
    for (const text of ['[]', '1', '"x"', 'null']) {
      const r = parseObject(text, 'Resource')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toBe('Resource: must be a JSON object')
    }
  })
})

describe('labels', () => {
  it('formats rules as indented JSON that round-trips', () => {
    const rules = [{ id: 'a', effect: 'allow' as const, actions: ['*'] }]
    expect(JSON.parse(formatRules(rules))).toEqual(rules)
    expect(formatRules(rules)).toContain('\n  ')
  })
  it('describes each mode, defaulting to off', () => {
    expect(modeInfo('shadow').status).toBe('warning')
    expect(modeInfo('enforce').description).toMatch(/only remove access/)
    expect(modeInfo('off').label).toBe('Off')
    expect(modeInfo('something-new').label).toBe('Off')
  })
  it('explains reasons, keeping the unmet obligation and unknown codes', () => {
    expect(reasonLabel('no_applicable_rule')).toMatch(/default deny/)
    expect(reasonLabel('deny_rule_indeterminate')).toMatch(/missing attribute/)
    expect(reasonLabel('obligation_unmet:require_mfa')).toBe('Denied — obligation not met (require_mfa)')
    expect(reasonLabel('future_reason')).toBe('future_reason')
  })
  it('explains divergences', () => {
    expect(divergenceLabel('pdp_deny_code_allow')).toMatch(/stricter/)
    expect(divergenceLabel('pdp_allow_code_deny')).toMatch(/looser/)
    expect(divergenceLabel('other')).toBe('other')
    expect(divergenceLabel(undefined)).toBe('')
  })
})
