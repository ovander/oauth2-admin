/**
 * Integration tests for usePolicyEditor — every editor flow against the real
 * api stack with MSW: load, edit, validate, save (and its invalid / conflict /
 * step-up-cancelled outcomes), restore, and simulate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../msw/server'
import { BASE } from '../msw/handlers'

// Only the step-up prompt is mocked; the interceptor stays real.
vi.mock('@/services/adminGuards', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/adminGuards')>()
  return { ...actual, requireElevation: vi.fn() }
})
import { requireElevation } from '@/services/adminGuards'
import { usePolicyEditor } from '@/composables/usePolicyEditor'

const RULES = [{ id: 'global-admins', effect: 'allow', actions: ['* /api/admin/*'] }]
const V3 = { version: 3, rules: RULES, note: 'baseline', created_at: '2026-09-27T10:00:00Z', mode: 'shadow' }
const CATALOGUE = {
  mode: 'shadow', admin_actions: ['GET /api/admin/stats'], exempt_actions: ['PUT /api/admin/policy'],
  attributes: ['principal.role'], attribute_maps: ['principal.attributes.<key>'], operators: ['eq'], obligations: ['require_mfa'],
}

function happyPath() {
  server.use(
    http.get(`${BASE}/api/admin/policy`, () => HttpResponse.json(V3)),
    http.get(`${BASE}/api/admin/policy/catalogue`, () => HttpResponse.json(CATALOGUE)),
    http.get(`${BASE}/api/admin/policy/versions`, () => HttpResponse.json({ versions: [{ version: 3, created_at: '', rule_count: 1 }] })),
    http.get(`${BASE}/api/admin/policy/decisions`, () => HttpResponse.json({ decisions: [{ id: 1, action: 'GET /api/admin/stats', allow: false }] })),
  )
}

async function loaded() {
  happyPath()
  const ed = usePolicyEditor()
  await ed.load()
  return ed
}

beforeEach(() => vi.mocked(requireElevation).mockReset())

describe('usePolicyEditor — load', () => {
  it('loads the version, catalogue, history and decisions', async () => {
    const ed = await loaded()
    expect(ed.policy.value?.version).toBe(3)
    expect(ed.mode.value).toBe('shadow')
    expect(ed.catalogue.value?.admin_actions).toHaveLength(1)
    expect(ed.versions.value).toHaveLength(1)
    expect(ed.decisions.value).toHaveLength(1)
    expect(ed.loadError.value).toBeNull()
  })

  it('explains an empty store rather than showing a bare 404', async () => {
    happyPath()
    server.use(http.get(`${BASE}/api/admin/policy`, () => HttpResponse.json({ error: 'no policy version is stored' }, { status: 404 })))
    const ed = usePolicyEditor()
    await ed.load()
    expect(ed.loadError.value).toMatch(/No policy version is stored yet/)
    expect(ed.mode.value).toBe('off')
  })

  it('reports other load failures', async () => {
    happyPath()
    server.use(http.get(`${BASE}/api/admin/policy/catalogue`, () => HttpResponse.json({ error: 'forbidden: superadmin required' }, { status: 403 })))
    const ed = usePolicyEditor()
    await ed.load()
    expect(ed.loadError.value).toBe('forbidden: superadmin required')
  })

  it('reloads decisions with the divergence filter', async () => {
    const ed = await loaded()
    let url = ''
    server.use(http.get(`${BASE}/api/admin/policy/decisions`, ({ request }) => {
      url = request.url
      return HttpResponse.json({ decisions: [] })
    }))
    ed.divergenceOnly.value = true
    await ed.loadDecisions()
    expect(url).toContain('divergence=true')
    expect(ed.decisions.value).toHaveLength(0)
  })
})

describe('usePolicyEditor — editing', () => {
  it('startEdit copies the current rules; cancel discards feedback', async () => {
    const ed = await loaded()
    ed.startEdit()
    expect(ed.editing.value).toBe(true)
    expect(JSON.parse(ed.draftText.value)).toEqual(RULES)
    ed.parseError.value = 'x'
    ed.cancelEdit()
    expect(ed.editing.value).toBe(false)
    expect(ed.parseError.value).toBeNull()
  })

  it('refuses to send text that is not a rule array', async () => {
    const ed = await loaded()
    ed.startEdit()
    ed.draftText.value = '{"not": "an array"}'
    expect(await ed.validate()).toBe(false)
    expect(ed.parseError.value).toMatch(/array/)
    expect(await ed.save()).toBe('invalid')
  })

  it('validate: success, then every server-reported problem', async () => {
    const ed = await loaded()
    ed.startEdit()
    server.use(http.post(`${BASE}/api/admin/policy/validate`, () => HttpResponse.json({ valid: true })))
    expect(await ed.validate()).toBe(true)
    expect(ed.validated.value).toBe(true)

    ed.onDraftChanged()
    expect(ed.validated.value).toBe(false)

    server.use(http.post(`${BASE}/api/admin/policy/validate`, () => HttpResponse.json({
      error: 'invalid_policy',
      errors: [{ rule: 'a', path: 'effect', message: 'must be "allow" or "deny"' }, { rule: 'b', path: 'when.attr', message: 'unknown attribute' }],
    }, { status: 422 })))
    expect(await ed.validate()).toBe(false)
    expect(ed.validationErrors.value).toHaveLength(2)
  })

  it('validate: a non-validation failure is reported as such', async () => {
    const ed = await loaded()
    ed.startEdit()
    server.use(http.post(`${BASE}/api/admin/policy/validate`, () => HttpResponse.json({ error: 'policy store error' }, { status: 500 })))
    expect(await ed.validate()).toBe(false)
    expect(ed.writeError.value).toBe('policy store error')
  })

  it('save: sends the loaded version as base, then refreshes history', async () => {
    const ed = await loaded()
    ed.startEdit()
    ed.note.value = 'tighten deletes'
    let body: { base_version?: number; note?: string } = {}
    server.use(
      http.put(`${BASE}/api/admin/policy`, async ({ request }) => {
        body = await request.json() as typeof body
        return HttpResponse.json({ ...V3, version: 4, note: 'tighten deletes' })
      }),
      http.get(`${BASE}/api/admin/policy/versions`, () => HttpResponse.json({ versions: [{ version: 4 }, { version: 3 }] })),
    )
    expect(await ed.save()).toBe('saved')
    expect(body.base_version).toBe(3)
    expect(body.note).toBe('tighten deletes')
    expect(ed.policy.value?.version).toBe(4)
    expect(ed.editing.value).toBe(false)
    expect(ed.versions.value).toHaveLength(2)
  })

  it('save: 422 shows every problem and keeps the editor open', async () => {
    const ed = await loaded()
    ed.startEdit()
    server.use(http.put(`${BASE}/api/admin/policy`, () => HttpResponse.json({
      error: 'invalid_policy', errors: [{ rule: 'a', path: 'actions', message: 'at least one action pattern is required' }],
    }, { status: 422 })))
    expect(await ed.save()).toBe('invalid')
    expect(ed.validationErrors.value[0].path).toBe('actions')
    expect(ed.editing.value).toBe(true)
  })

  it('save: 409 flags a conflict; reloading keeps the draft', async () => {
    const ed = await loaded()
    ed.startEdit()
    ed.draftText.value = '[{"id":"mine","effect":"deny","actions":["DELETE *"]}]'
    server.use(http.put(`${BASE}/api/admin/policy`, () => HttpResponse.json({ error: 'policy was changed by someone else' }, { status: 409 })))
    expect(await ed.save()).toBe('conflict')
    expect(ed.conflict.value).toBe(true)

    server.use(http.get(`${BASE}/api/admin/policy`, () => HttpResponse.json({ ...V3, version: 5 })))
    await ed.reloadKeepingDraft()
    expect(ed.conflict.value).toBe(false)
    expect(ed.policy.value?.version).toBe(5)
    expect(ed.draftText.value).toContain('"mine"')
  })

  it('save: step-up is prompted and the save retried', async () => {
    const ed = await loaded()
    ed.startEdit()
    vi.mocked(requireElevation).mockResolvedValueOnce(undefined)
    let calls = 0
    server.use(http.put(`${BASE}/api/admin/policy`, () => {
      calls++
      return calls === 1
        ? HttpResponse.json({ error: 'elevation_required' }, { status: 403 })
        : HttpResponse.json({ ...V3, version: 4 })
    }))
    expect(await ed.save()).toBe('saved')
    expect(requireElevation).toHaveBeenCalledTimes(1)
    expect(calls).toBe(2)
  })

  it('save: dismissing the step-up prompt is "cancelled", not an error', async () => {
    const ed = await loaded()
    ed.startEdit()
    vi.mocked(requireElevation).mockRejectedValueOnce(new Error('cancelled'))
    server.use(http.put(`${BASE}/api/admin/policy`, () => HttpResponse.json({ error: 'elevation_required' }, { status: 403 })))
    expect(await ed.save()).toBe('cancelled')
    expect(ed.writeError.value).toBeNull()
    expect(ed.editing.value).toBe(true)
  })

  it('save: any other failure is surfaced', async () => {
    const ed = await loaded()
    ed.startEdit()
    server.use(http.put(`${BASE}/api/admin/policy`, () => HttpResponse.json({ error: 'policy store error' }, { status: 500 })))
    expect(await ed.save()).toBe('error')
    expect(ed.writeError.value).toBe('policy store error')
  })
})

describe('usePolicyEditor — history', () => {
  it('restore saves forward from the loaded version', async () => {
    const ed = await loaded()
    let body: { base_version?: number } = {}
    server.use(http.post(`${BASE}/api/admin/policy/versions/1/restore`, async ({ request }) => {
      body = await request.json() as typeof body
      return HttpResponse.json({ ...V3, version: 4, note: 'restore of version 1' })
    }))
    expect(await ed.restore(1)).toBe('saved')
    expect(body.base_version).toBe(3)
    expect(ed.policy.value?.version).toBe(4)
  })

  it('restore reports a conflict', async () => {
    const ed = await loaded()
    server.use(http.post(`${BASE}/api/admin/policy/versions/1/restore`, () => HttpResponse.json({ error: 'changed' }, { status: 409 })))
    expect(await ed.restore(1)).toBe('conflict')
  })

  it('viewVersion fetches one version', async () => {
    const ed = await loaded()
    server.use(http.get(`${BASE}/api/admin/policy/versions/2`, () => HttpResponse.json({ ...V3, version: 2 })))
    expect((await ed.viewVersion(2)).version).toBe(2)
  })
})

describe('usePolicyEditor — simulate', () => {
  const RESULT = {
    decision: { allow: false, rule: 'superadmin-management', reason: 'denied_by_rule', policy_version: 3 },
    trace: [{ rule: 'superadmin-management', effect: 'deny', action_matched: true, result: 'true' }],
  }

  it('checks its inputs before asking', async () => {
    const ed = await loaded()
    ed.simPrincipal.value = '{'
    await ed.simulate()
    expect(ed.simError.value).toMatch(/^Principal/)

    ed.simPrincipal.value = '{}'
    ed.simResource.value = '[]'
    await ed.simulate()
    expect(ed.simError.value).toMatch(/^Resource/)

    ed.simResource.value = '{}'
    ed.simContext.value = '1'
    await ed.simulate()
    expect(ed.simError.value).toMatch(/^Context/)

    ed.simContext.value = ''
    ed.simAction.value = '  '
    await ed.simulate()
    expect(ed.simError.value).toMatch(/Enter the action/)
  })

  it('simulates against the current version', async () => {
    const ed = await loaded()
    let body: { input?: { action?: string }; rules?: unknown } = {}
    server.use(http.post(`${BASE}/api/admin/policy/simulate`, async ({ request }) => {
      body = await request.json() as typeof body
      return HttpResponse.json(RESULT)
    }))
    ed.simAction.value = 'GET /api/admin/superadmins'
    await ed.simulate()
    expect(ed.simResult.value?.decision.rule).toBe('superadmin-management')
    expect(body.input?.action).toBe('GET /api/admin/superadmins')
    expect(body.rules).toBeUndefined()
  })

  it('simulates against the draft when asked, and reports an invalid draft', async () => {
    const ed = await loaded()
    ed.startEdit()
    ed.simUseDraft.value = true
    ed.simAction.value = 'x'

    ed.draftText.value = 'not json'
    await ed.simulate()
    expect(ed.simError.value).toMatch(/draft rules are not valid JSON/)

    ed.draftText.value = '[]'
    let body: { rules?: unknown } = {}
    server.use(http.post(`${BASE}/api/admin/policy/simulate`, async ({ request }) => {
      body = await request.json() as typeof body
      return HttpResponse.json({ error: 'invalid_policy', errors: [{ rule: 'a', path: 'id', message: 'bad' }] }, { status: 422 })
    }))
    await ed.simulate()
    expect(body.rules).toEqual([])
    expect(ed.simError.value).toMatch(/The draft is invalid: a id: bad/)
  })

  it('surfaces a failure', async () => {
    const ed = await loaded()
    ed.simAction.value = 'x'
    server.use(http.post(`${BASE}/api/admin/policy/simulate`, () => HttpResponse.json({ error: 'no policy version is stored' }, { status: 404 })))
    await ed.simulate()
    expect(ed.simError.value).toBe('no policy version is stored')
  })
})
