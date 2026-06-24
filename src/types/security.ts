// ─── Security Events (/api/admin/security/events) ────────────────────────────

export interface SecurityEvent {
  id:          number
  event_type:  string          // free string — backend may emit types beyond the union below
  severity:    EventSeverity
  user_id?:    number
  user_email?: string
  app_id?:     number
  app_name?:   string
  ip_address?: string          // omitempty on backend
  user_agent?: string
  details?:    Record<string, unknown>  // omitempty — shape varies per event_type
  success:     boolean
  created_at:  string          // RFC3339
}

// Known event_type values (non-exhaustive — backend may emit others)
export type SecurityEventType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'account_locked'
  | 'account_unlocked'
  | 'password_changed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'token_revoked'
  | 'token_refreshed'
  | 'token_issued'
  | 'expired_token_used'
  | 'invalid_token_used'
  | 'brute_force_detected'
  | 'suspicious_activity'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'email_verified'

export type EventSeverity = 'info' | 'warning' | 'error' | 'critical'

export interface SecurityEventFilters {
  event_type?: string           // string, not the union, to allow unknown types
  severity?:   EventSeverity
  user_id?:    number
  app_id?:     number
  ip_address?: string
  success?:    boolean
  from?:       string           // RFC3339 (backend uses "from"/"to", not "start_date"/"end_date")
  to?:         string
  page?:       number
  page_size?:  number
}

export interface SecurityEventListResponse {
  events:    SecurityEvent[]
  total:     number             // backend field is "total", not "total_count"
  page:      number
  page_size: number
}

// ─── Threat Metrics (/api/admin/security/threats) ─────────────────────────────

export interface ThreatSummary {
  total_events:     number
  critical_events:  number
  error_events:     number
  warning_events:   number
  unique_attackers: number
}

export interface ThreatTypeStats {
  type:           string
  count:          number
  unique_ips:     number
  affected_users: number
  affected_apps:  number
}

export interface SuspiciousIPInfo {
  ip_address:  string
  event_count: number
  event_types: string[]
  first_seen:  string   // RFC3339
  last_seen:   string   // RFC3339
}

export interface LockedAccountInfo {
  user_id:         number
  email:           string
  locked_at:       string    // RFC3339
  locked_until?:   string    // RFC3339, omitempty
  failed_attempts: number
}

export interface ThreatMetricsResponse {
  time_range:      string               // "15m" | "1h" | "24h" | "7d" | "30d"
  summary:         ThreatSummary
  top_threats:     ThreatTypeStats[]    // top 5 failed event types
  suspicious_ips:  SuspiciousIPInfo[]   // IPs with >5 failures, top 10
  locked_accounts: LockedAccountInfo[]
}

// ─── Admin Audit Logs (/api/admin/logs — NOT YET IMPLEMENTED) ─────────────────

export interface AdminAuditLog {
  id:           number
  admin_id:     number
  admin_email:  string
  action:       AuditActionType
  target_type:  'user' | 'application' | 'settings'
  target_id?:   number
  target_name?: string
  changes?:     Record<string, { old: unknown; new: unknown }>
  ip_address:   string
  created_at:   string
}

export type AuditActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'lock'
  | 'unlock'
  | 'invite'
  | 'revoke'
  | 'regenerate_secret'
  | 'change_role'
  | 'bulk_action'

export interface AdminAuditFilters {
  admin_id?:    number
  action?:      AuditActionType
  target_type?: 'user' | 'application' | 'settings'
  start_date?:  string
  end_date?:    string
  page?:        number
  page_size?:   number
}

export interface AdminAuditListResponse {
  logs:        AdminAuditLog[]
  total_count: number
  page:        number
  page_size:   number
}
