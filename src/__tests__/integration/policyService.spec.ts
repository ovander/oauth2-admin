/**
 * Integration tests for policyService.ts — each call hits the right Socrate
 * admin route with the right method and body (MSW).
 */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../msw/server'
import { BASE } from '../msw/handlers'
import * as policyService from '@/services/policyService'

const VERSION = { version: 3, rules: [], created_at: '2026-09-27T10:00:00Z', mode: 'shadow' }

describe('policyService', () => {
  it('getPolicy and getVersion', async () => {
    server.use(
      http.get(`${BASE}/api/admin/policy`, () => HttpResponse.json(VERSION)),
      http.get(`${BASE}/api/admin/policy/versions/2`, () => HttpResponse.json({ ...VERSION, version: 2 })),
    )
    expect((await policyService.getPolicy()).version).toBe(3)
    expect((await policyService.getVersion(2)).version).toBe(2)
  })

  it('savePolicy sends base_version, rules and note', async () => {
    let body: unknown
    server.use(http.put(`${BASE}/api/admin/policy`, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ ...VERSION, version: 4 })
    }))
    const rules = [{ id: 'a', effect: 'allow' as const, actions: ['*'] }]
    const saved = await policyService.savePolicy(3, rules, 'why')
    expect(saved.version).toBe(4)
    expect(body).toEqual({ base_version: 3, rules, note: 'why' })
  })

  it('validatePolicy posts the rules', async () => {
    let body: unknown
    server.use(http.post(`${BASE}/api/admin/policy/validate`, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ valid: true })
    }))
    await policyService.validatePolicy([])
    expect(body).toEqual({ rules: [] })
  })

  it('simulatePolicy sends rules only for a draft', async () => {
    const bodies: unknown[] = []
    server.use(http.post(`${BASE}/api/admin/policy/simulate`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ decision: { allow: true, reason: 'allowed_by_rule', policy_version: 3 }, trace: [] })
    }))
    const input = { principal: { kind: 'user' }, action: 'x' }
    await policyService.simulatePolicy(input)
    await policyService.simulatePolicy(input, [])
    expect(bodies[0]).toEqual({ input })
    expect(bodies[1]).toEqual({ input, rules: [] })
  })

  it('getCatalogue, listVersions, restoreVersion', async () => {
    let restoreBody: unknown
    let listUrl = ''
    server.use(
      http.get(`${BASE}/api/admin/policy/catalogue`, () => HttpResponse.json({ mode: 'off', admin_actions: ['GET /api/admin/stats'], exempt_actions: [], attributes: [], attribute_maps: [], operators: [], obligations: [] })),
      http.get(`${BASE}/api/admin/policy/versions`, ({ request }) => {
        listUrl = request.url
        return HttpResponse.json({ versions: [{ version: 1, created_at: '', rule_count: 4 }] })
      }),
      http.post(`${BASE}/api/admin/policy/versions/1/restore`, async ({ request }) => {
        restoreBody = await request.json()
        return HttpResponse.json({ ...VERSION, version: 5 })
      }),
    )
    expect((await policyService.getCatalogue()).admin_actions).toHaveLength(1)
    expect(await policyService.listVersions(10)).toHaveLength(1)
    expect(listUrl).toContain('limit=10')
    expect((await policyService.restoreVersion(1, 4)).version).toBe(5)
    expect(restoreBody).toEqual({ base_version: 4 })
  })

  it('getDecisions passes divergence only when asked', async () => {
    const urls: string[] = []
    server.use(http.get(`${BASE}/api/admin/policy/decisions`, ({ request }) => {
      urls.push(request.url)
      return HttpResponse.json({ decisions: [] })
    }))
    await policyService.getDecisions()
    await policyService.getDecisions({ divergence: true, limit: 5 })
    expect(urls[0]).toContain('limit=50')
    expect(urls[0]).not.toContain('divergence')
    expect(urls[1]).toContain('divergence=true')
    expect(urls[1]).toContain('limit=5')
  })
})
