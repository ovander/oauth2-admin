/**
 * Integration tests for monitoringService.ts.
 *
 * Real authService/api stack with MSW intercepting HTTP. Verifies that each
 * monitoring endpoint hits the correct Socrate admin route with the right
 * method/params and returns the parsed body.
 *
 * The SSE helper (connectSecurityEventStream) is not covered here — it relies
 * on fetch + ReadableStream which is exercised manually.
 */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../msw/server'
import { BASE } from '../msw/handlers'

import * as monitoringService from '@/services/monitoringService'

// Under the BFF model the browser sends no bearer — auth rides on the session
// cookie and the BFF injects the token server-side. These MSW routes therefore
// do not assert an Authorization header.

// ─── Sessions ─────────────────────────────────────────────────────────────────
describe('monitoringService — sessions', () => {
  it('getSessions hits /api/admin/sessions and forwards filters', async () => {
    let capturedUrl = ''
    server.use(
      http.get(`${BASE}/api/admin/sessions`, ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({ sessions: [{ id: 's1', user_email: 'a@b.com' }], total: 1, page: 1, page_size: 25 })
      }),
    )

    const res = await monitoringService.getSessions({ user_id: 7, page: 1 })

    expect(res.sessions).toHaveLength(1)
    expect(capturedUrl).toContain('user_id=7')
  })

  it('getUserSessions hits /api/admin/users/{id}/sessions', async () => {
    server.use(
      http.get(`${BASE}/api/admin/users/42/sessions`, () =>
        HttpResponse.json({ sessions: [], total: 0, page: 1, page_size: 25 }),
      ),
    )

    const res = await monitoringService.getUserSessions(42)
    expect(res.total).toBe(0)
  })
})

// ─── Token analytics ──────────────────────────────────────────────────────────
describe('monitoringService — token stats', () => {
  it('getTokenStats hits /api/admin/tokens/stats with period', async () => {
    let capturedUrl = ''
    server.use(
      http.get(`${BASE}/api/admin/tokens/stats`, ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({
          period: '24h',
          issued: { access_tokens: 10, refresh_tokens: 4, id_tokens: 2 },
          refreshed: 3, revoked: 1, expired_usage_attempts: 0, invalid_usage_attempts: 0,
          by_app: [], by_hour: [],
        })
      }),
    )

    const res = await monitoringService.getTokenStats('24h')
    expect(res.issued.access_tokens).toBe(10)
    expect(capturedUrl).toContain('period=24h')
  })
})

// ─── Geo ──────────────────────────────────────────────────────────────────────
describe('monitoringService — geo analytics', () => {
  it('getGeoAnalytics hits /api/admin/security/geo with period', async () => {
    let capturedUrl = ''
    server.use(
      http.get(`${BASE}/api/admin/security/geo`, ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({ period: '7d', geo_configured: true, by_country: [], by_city: [], anomalies: [] })
      }),
    )

    const res = await monitoringService.getGeoAnalytics('7d')
    expect(res.geo_configured).toBe(true)
    expect(capturedUrl).toContain('period=7d')
  })
})

// ─── Blocked IPs + reputation ──────────────────────────────────────────────────
describe('monitoringService — blocked IPs', () => {
  it('getBlockedIPs hits /api/admin/security/blocked-ips', async () => {
    server.use(
      http.get(`${BASE}/api/admin/security/blocked-ips`, () =>
        HttpResponse.json({ blocked_ips: [{ id: 1, ip_address: '1.2.3.4', permanent: true, blocked_at: 'x' }], total: 1 }),
      ),
    )
    const res = await monitoringService.getBlockedIPs()
    expect(res.blocked_ips[0].ip_address).toBe('1.2.3.4')
  })

  it('blockIP POSTs the request body', async () => {
    let body: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/api/admin/security/blocked-ips`, async ({ request }) => {
        body = await request.json() as Record<string, unknown>
        return HttpResponse.json({ id: 9, ip_address: body.ip_address, permanent: true, blocked_at: 'x' })
      }),
    )
    const res = await monitoringService.blockIP({ ip_address: '9.9.9.9', permanent: true })
    expect(body.ip_address).toBe('9.9.9.9')
    expect(res.id).toBe(9)
  })

  it('unblockIP DELETEs /api/admin/security/blocked-ips/{id}', async () => {
    let hit = false
    server.use(
      http.delete(`${BASE}/api/admin/security/blocked-ips/3`, () => { hit = true; return new HttpResponse(null, { status: 204 }) }),
    )
    await monitoringService.unblockIP(3)
    expect(hit).toBe(true)
  })

  it('getIPReputation encodes the IP into the path', async () => {
    server.use(
      http.get(`${BASE}/api/admin/security/ip-reputation/1.2.3.4`, () =>
        HttpResponse.json({
          ip_address: '1.2.3.4', is_blocked: false, risk_score: 80,
          events_24h: 5, events_7d: 9, failed_logins_24h: 4, unique_users_targeted: 2, recent_events: [],
        }),
      ),
    )
    const res = await monitoringService.getIPReputation('1.2.3.4')
    expect(res.risk_score).toBe(80)
  })
})

// ─── Alerts ─────────────────────────────────────────────────────────────────--
describe('monitoringService — alerts', () => {
  it('getAlertRules hits /api/admin/alerts/rules', async () => {
    server.use(
      http.get(`${BASE}/api/admin/alerts/rules`, () => HttpResponse.json({ rules: [], total: 0 })),
    )
    const res = await monitoringService.getAlertRules()
    expect(res.total).toBe(0)
  })

  it('createAlertRule POSTs to /api/admin/alerts/rules', async () => {
    let body: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/api/admin/alerts/rules`, async ({ request }) => {
        body = await request.json() as Record<string, unknown>
        return HttpResponse.json({ id: 1, ...body, enabled: true, created_at: 'x', updated_at: 'x' })
      }),
    )
    await monitoringService.createAlertRule({
      name: 'Brute force', event_type: 'login_failed', condition: { threshold: 5 },
      severity: 'critical', actions: ['email'],
    })
    expect(body.name).toBe('Brute force')
  })

  it('acknowledgeAlert POSTs to /api/admin/alerts/{id}/acknowledge', async () => {
    let hit = false
    server.use(
      http.post(`${BASE}/api/admin/alerts/5/acknowledge`, () => { hit = true; return HttpResponse.json({}) }),
    )
    await monitoringService.acknowledgeAlert(5, { note: 'handled' })
    expect(hit).toBe(true)
  })

  it('getAlertHistory forwards acknowledged filter', async () => {
    let capturedUrl = ''
    server.use(
      http.get(`${BASE}/api/admin/alerts/history`, ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({ alerts: [], total: 0, unacknowledged: 0, page: 1, page_size: 25 })
      }),
    )
    await monitoringService.getAlertHistory({ acknowledged: false })
    expect(capturedUrl).toContain('acknowledged=false')
  })
})

// ─── Reports ────────────────────────────────────────────────────────────────--
describe('monitoringService — reports', () => {
  it('generateSecurityReport POSTs to /api/admin/reports/security', async () => {
    let body: Record<string, unknown> = {}
    server.use(
      http.post(`${BASE}/api/admin/reports/security`, async ({ request }) => {
        body = await request.json() as Record<string, unknown>
        return HttpResponse.json({ report_id: 'r1', status: 'pending', type: 'security', format: 'pdf', created_at: 'x' })
      }),
    )
    const res = await monitoringService.generateSecurityReport({
      type: 'security', format: 'pdf', period: { from: 'a', to: 'b' },
    })
    expect(res.report_id).toBe('r1')
    expect(body.type).toBe('security')
  })

  it('getReportStatus hits /api/admin/reports/{id}', async () => {
    server.use(
      http.get(`${BASE}/api/admin/reports/r1`, () =>
        HttpResponse.json({ report_id: 'r1', status: 'completed', type: 'security', format: 'pdf', created_at: 'x' }),
      ),
    )
    const res = await monitoringService.getReportStatus('r1')
    expect(res.status).toBe('completed')
  })

  it('downloadReport requests the blob from /{id}/download', async () => {
    server.use(
      http.get(`${BASE}/api/admin/reports/r1/download`, () =>
        HttpResponse.text('col1,col2\n1,2', { headers: { 'Content-Type': 'text/csv' } }),
      ),
    )
    const blob = await monitoringService.downloadReport('r1')
    expect(blob).toBeInstanceOf(Blob)
  })
})

// ─── Helpers ────────────────────────────────────────────────────────────────--
describe('monitoringService — riskStatus()', () => {
  it('maps scores to badge severities', () => {
    expect(monitoringService.riskStatus(90)).toBe('error')
    expect(monitoringService.riskStatus(60)).toBe('warning')
    expect(monitoringService.riskStatus(30)).toBe('info')
    expect(monitoringService.riskStatus(10)).toBe('success')
  })
})
