// ─────────────────────────────────────────────────────────────────────────────
// Types for the Socrate security-monitoring admin API
//   /api/admin/security/{geo,blocked-ips,ip-reputation}
//   /api/admin/{sessions,tokens/stats,events/stream,reports,alerts}
//
// Field names mirror internal/dto/monitoring_dto.go exactly.
// ─────────────────────────────────────────────────────────────────────────────
import type { SecurityEvent, EventSeverity, ThreatTypeStats, SuspiciousIPInfo } from './security'

// ─── Active Sessions (/api/admin/sessions) ───────────────────────────────────

export interface AdminSession {
  id:            string
  user_id:       number
  user_email:    string
  app_id:        number
  app_name:      string
  ip_address:    string
  user_agent:    string
  created_at:    string
  last_activity: string
  expires_at:    string
}

export interface AdminSessionsListResponse {
  sessions:  AdminSession[]
  total:     number
  page:      number
  page_size: number
}

export interface SessionFilters {
  user_id?:   number
  app_id?:    number
  page?:      number
  page_size?: number
}

// ─── Token Analytics (/api/admin/tokens/stats) ───────────────────────────────

export interface TokenCounts {
  access_tokens:  number
  refresh_tokens: number
  id_tokens:      number
}

export interface TokenAppStats {
  app_id:    number
  app_name:  string
  issued:    number
  refreshed: number
  revoked:   number
}

export interface TokenHourlyStats {
  hour:      string
  issued:    number
  refreshed: number
  revoked:   number
}

export interface TokenStatsResponse {
  period:                 string
  issued:                 TokenCounts
  refreshed:              number
  revoked:                number
  expired_usage_attempts: number
  invalid_usage_attempts: number
  by_app:                 TokenAppStats[]
  by_hour:                TokenHourlyStats[]
}

// ─── Blocked IPs (/api/admin/security/blocked-ips) ───────────────────────────

export interface BlockIPRequest {
  ip_address:     string
  reason?:        string
  duration_hours?: number
  permanent?:     boolean
}

export interface BlockedIP {
  id:               number
  ip_address:       string
  reason?:          string
  blocked_by?:      number
  blocked_by_email?: string
  blocked_at:       string
  expires_at?:      string
  permanent:        boolean
}

export interface BlockedIPsListResponse {
  blocked_ips: BlockedIP[]
  total:       number
}

// ─── IP Reputation (/api/admin/security/ip-reputation/{ip}) ──────────────────

export interface IPReputation {
  ip_address:            string
  is_blocked:            boolean
  risk_score:            number
  events_24h:            number
  events_7d:             number
  failed_logins_24h:     number
  unique_users_targeted: number
  first_seen?:           string
  last_seen?:            string
  recent_events:         SecurityEvent[]
}

// ─── Geographic Analytics (/api/admin/security/geo) ──────────────────────────

export interface GeoCountryStats {
  country_code: string
  country_name: string
  login_count:  number
  unique_users: number
  failed_count: number
}

export interface GeoCityStats {
  city:         string
  country_code: string
  latitude:     number
  longitude:    number
  login_count:  number
  failed_count: number
}

export interface GeoAnomaly {
  user_id:       number
  user_email:    string
  description:   string
  usual_country: string
  login_country: string
  created_at:    string
}

export interface GeoAnalyticsResponse {
  period:         string
  geo_configured: boolean
  by_country:     GeoCountryStats[]
  by_city:        GeoCityStats[]
  anomalies:      GeoAnomaly[]
}

// ─── Alert Rules (/api/admin/alerts/rules) ───────────────────────────────────

export interface AlertRuleRequest {
  name:         string
  description?: string
  event_type:   string
  condition:    Record<string, unknown>
  severity:     EventSeverity
  enabled?:     boolean
  actions:      string[]
  recipients?:  string[]
  webhook_url?: string
}

export interface AlertRule {
  id:           number
  name:         string
  description?: string
  event_type:   string
  condition:    Record<string, unknown>
  severity:     EventSeverity
  enabled:      boolean
  actions:      string[]
  recipients?:  string[]
  webhook_url?: string
  created_at:   string
  updated_at:   string
}

export interface AlertRulesListResponse {
  rules: AlertRule[]
  total: number
}

// ─── Triggered Alerts (/api/admin/alerts/history) ────────────────────────────

export interface TriggeredAlert {
  id:               number
  rule_id:          number
  rule_name:        string
  severity:         EventSeverity
  message:          string
  details?:         Record<string, unknown>
  acknowledged:     boolean
  acknowledged_by?: number
  acknowledged_at?: string
  acknowledge_note?: string
  triggered_at:     string
}

export interface AlertsHistoryResponse {
  alerts:         TriggeredAlert[]
  total:          number
  unacknowledged: number
  page:           number
  page_size:      number
}

export interface AlertsHistoryFilters {
  acknowledged?: boolean
  severity?:     EventSeverity
  page?:         number
  page_size?:    number
}

export interface AcknowledgeAlertRequest {
  note?: string
}

// ─── Report Generation (/api/admin/reports) ──────────────────────────────────

export interface ReportPeriod {
  from: string
  to:   string
}

export interface ReportRequest {
  type:      string            // e.g. 'security'
  period:    ReportPeriod
  format:    string            // 'pdf' | 'csv' | 'json'
  sections?: string[]
}

export type ReportStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface ReportResponse {
  report_id:            string
  status:               ReportStatus
  type:                 string
  format:               string
  download_url?:        string
  estimated_completion?: string
  created_at:           string
  completed_at?:        string
  expires_at?:          string
}

// ─── Real-time event stream (/api/admin/events/stream, SSE) ──────────────────

export interface RealtimeEventMessage {
  type: string
  data: SecurityEvent | Record<string, unknown>
}

// Re-export shared shapes used by monitoring views.
export type { SecurityEvent, EventSeverity, ThreatTypeStats, SuspiciousIPInfo }
