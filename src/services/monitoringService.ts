import api from './api'
import { ADMIN_API_URL } from '@/utils/secureConfig'
import type {
  AdminSessionsListResponse,
  SessionFilters,
  TokenStatsResponse,
  BlockedIPsListResponse,
  BlockIPRequest,
  BlockedIP,
  IPReputation,
  GeoAnalyticsResponse,
  AlertRule,
  AlertRuleRequest,
  AlertRulesListResponse,
  AlertsHistoryResponse,
  AlertsHistoryFilters,
  AcknowledgeAlertRequest,
  ReportRequest,
  ReportResponse,
  RealtimeEventMessage,
} from '@/types/monitoring'

// ─── Active Sessions (/api/admin/sessions) ───────────────────────────────────

export async function getSessions(filters?: SessionFilters): Promise<AdminSessionsListResponse> {
  const response = await api.get<AdminSessionsListResponse>('/api/admin/sessions', { params: filters })
  return response.data
}

/** Sessions for a single user — GET /api/admin/users/{id}/sessions */
export async function getUserSessions(userId: number): Promise<AdminSessionsListResponse> {
  const response = await api.get<AdminSessionsListResponse>(`/api/admin/users/${userId}/sessions`)
  return response.data
}

// ─── Token Analytics (/api/admin/tokens/stats) ───────────────────────────────

export async function getTokenStats(period: string = '24h'): Promise<TokenStatsResponse> {
  const response = await api.get<TokenStatsResponse>('/api/admin/tokens/stats', { params: { period } })
  return response.data
}

// ─── Geographic Analytics (/api/admin/security/geo) ──────────────────────────

export async function getGeoAnalytics(period: string = '7d'): Promise<GeoAnalyticsResponse> {
  const response = await api.get<GeoAnalyticsResponse>('/api/admin/security/geo', { params: { period } })
  return response.data
}

// ─── Blocked IPs (/api/admin/security/blocked-ips) ───────────────────────────

export async function getBlockedIPs(): Promise<BlockedIPsListResponse> {
  const response = await api.get<BlockedIPsListResponse>('/api/admin/security/blocked-ips')
  return response.data
}

export async function blockIP(data: BlockIPRequest): Promise<BlockedIP> {
  const response = await api.post<BlockedIP>('/api/admin/security/blocked-ips', data)
  return response.data
}

export async function unblockIP(id: number): Promise<void> {
  await api.delete(`/api/admin/security/blocked-ips/${id}`)
}

// ─── IP Reputation (/api/admin/security/ip-reputation/{ip}) ──────────────────

export async function getIPReputation(ip: string): Promise<IPReputation> {
  const response = await api.get<IPReputation>(`/api/admin/security/ip-reputation/${encodeURIComponent(ip)}`)
  return response.data
}

// ─── Alert Rules (/api/admin/alerts/rules) ───────────────────────────────────

export async function getAlertRules(): Promise<AlertRulesListResponse> {
  const response = await api.get<AlertRulesListResponse>('/api/admin/alerts/rules')
  return response.data
}

export async function createAlertRule(data: AlertRuleRequest): Promise<AlertRule> {
  const response = await api.post<AlertRule>('/api/admin/alerts/rules', data)
  return response.data
}

export async function updateAlertRule(id: number, data: AlertRuleRequest): Promise<AlertRule> {
  const response = await api.put<AlertRule>(`/api/admin/alerts/rules/${id}`, data)
  return response.data
}

export async function deleteAlertRule(id: number): Promise<void> {
  await api.delete(`/api/admin/alerts/rules/${id}`)
}

// ─── Triggered Alerts (/api/admin/alerts/history, /{id}/acknowledge) ─────────

export async function getAlertHistory(filters?: AlertsHistoryFilters): Promise<AlertsHistoryResponse> {
  const response = await api.get<AlertsHistoryResponse>('/api/admin/alerts/history', { params: filters })
  return response.data
}

export async function acknowledgeAlert(id: number, data?: AcknowledgeAlertRequest): Promise<void> {
  await api.post(`/api/admin/alerts/${id}/acknowledge`, data ?? {})
}

// ─── Report Generation (/api/admin/reports) ──────────────────────────────────

export async function generateSecurityReport(data: ReportRequest): Promise<ReportResponse> {
  const response = await api.post<ReportResponse>('/api/admin/reports/security', data)
  return response.data
}

export async function getReportStatus(id: string): Promise<ReportResponse> {
  const response = await api.get<ReportResponse>(`/api/admin/reports/${id}`)
  return response.data
}

export async function downloadReport(id: string): Promise<Blob> {
  const response = await api.get(`/api/admin/reports/${id}/download`, { responseType: 'blob' })
  return response.data
}

// ─── Real-time event stream (/api/admin/events/stream, SSE) ──────────────────
//
// EventSource cannot send our custom CSRF/marker header, so we consume the SSE
// stream with fetch + a ReadableStream reader and parse the frames ourselves.
// Auth is the BFF session cookie (credentials: 'include'); the BFF injects the
// bearer server-side — no Authorization header is set in the browser.

export interface EventStreamFilters {
  severity?:   string
  event_type?: string
}

export interface EventStreamHandle {
  close(): void
}

export function connectSecurityEventStream(
  onEvent: (msg: RealtimeEventMessage) => void,
  opts: { filters?: EventStreamFilters; onError?: (err: unknown) => void } = {},
): EventStreamHandle {
  const controller = new AbortController()
  const params = new URLSearchParams()
  if (opts.filters?.severity) params.set('severity', opts.filters.severity)
  if (opts.filters?.event_type) params.set('event_type', opts.filters.event_type)
  const qs = params.toString()
  const url = `${ADMIN_API_URL}/api/admin/events/stream${qs ? `?${qs}` : ''}`

  ;(async () => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Accept: 'text/event-stream',
          'X-Requested-By': 'oauth2-admin',
        },
      })

      if (!response.ok || !response.body) {
        throw new Error(`event stream failed: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // SSE frames are separated by a blank line; each `data:` line carries JSON.
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let sep: number
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)

          const dataLines = frame
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trim())
          if (dataLines.length === 0) continue

          try {
            onEvent(JSON.parse(dataLines.join('\n')) as RealtimeEventMessage)
          } catch {
            /* ignore keep-alive / non-JSON frames */
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) opts.onError?.(err)
    }
  })()

  return { close: () => controller.abort() }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export const alertActionLabels: Record<string, string> = {
  email:   'Email',
  webhook: 'Webhook',
  log:     'Log',
}

/** Map a 0–100 risk score to a status colour for StatusBadge. */
export function riskStatus(score: number): 'success' | 'info' | 'warning' | 'error' {
  if (score >= 75) return 'error'
  if (score >= 50) return 'warning'
  if (score >= 25) return 'info'
  return 'success'
}
