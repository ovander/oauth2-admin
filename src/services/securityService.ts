import api from './api'
import type {
  SecurityEvent,
  SecurityEventFilters,
  SecurityEventListResponse,
  AdminAuditLog,
  AdminAuditFilters,
  AdminAuditListResponse,
  ThreatMetricsResponse,
} from '@/types/security'

// Security Events — backed by /api/admin/security/events
export async function getSecurityEvents(filters?: SecurityEventFilters): Promise<SecurityEventListResponse> {
  const response = await api.get<SecurityEventListResponse>('/api/admin/security/events', { params: filters })
  return response.data
}

export async function getRecentSecurityEvents(limit: number = 10): Promise<SecurityEvent[]> {
  const response = await api.get<SecurityEventListResponse>('/api/admin/security/events', {
    params: { limit }
  })
  return response.data.events ?? []
}

// Security Threats / Stats — backed by /api/admin/security/threats
export async function getSecurityStats(): Promise<ThreatMetricsResponse> {
  const response = await api.get<ThreatMetricsResponse>('/api/admin/security/threats')
  return response.data
}

// NOTE: Security-event CSV export is intentionally not provided. The admin API
// exposes no `/api/admin/security/events/export` route — server-wide security
// exports are produced asynchronously via the Reports API
// (`POST /api/admin/reports/security`), which the portal does not yet surface.
// Admin *audit* logs (below) do have a real export endpoint.

// Admin Audit Logs — /api/admin/logs
export async function getAdminAuditLogs(filters?: AdminAuditFilters): Promise<AdminAuditListResponse> {
  const response = await api.get<AdminAuditListResponse>('/api/admin/logs', { params: filters })
  return response.data
}

export async function getAdminAuditLog(id: number): Promise<AdminAuditLog> {
  const response = await api.get<AdminAuditLog>(`/api/admin/logs/${id}`)
  return response.data
}

export async function exportAdminLogs(filters?: AdminAuditFilters): Promise<Blob> {
  const response = await api.get('/api/admin/logs/export', {
    params: filters,
    responseType: 'blob',
  })
  return response.data
}

// Event Type Labels
export const securityEventLabels: Record<string, string> = {
  login_success: 'Login Success',
  login_failed: 'Login Failed',
  logout: 'Logout',
  account_locked: 'Account Locked',
  account_unlocked: 'Account Unlocked',
  password_changed: 'Password Changed',
  password_reset_requested: 'Password Reset Requested',
  password_reset_completed: 'Password Reset Completed',
  token_revoked: 'Token Revoked',
  token_refreshed: 'Token Refreshed',
  brute_force_detected: 'Brute Force Detected',
  suspicious_activity: 'Suspicious Activity',
  mfa_enabled: 'MFA Enabled',
  mfa_disabled: 'MFA Disabled',
  email_verified: 'Email Verified'
}

export const severityColors: Record<string, string> = {
  info: 'info',
  warning: 'warn',
  error: 'danger',
  critical: 'danger'
}

export const adminActionLabels: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  lock: 'Locked',
  unlock: 'Unlocked',
  invite: 'Invited',
  revoke: 'Revoked',
  regenerate_secret: 'Regenerated Secret',
  change_role: 'Changed Role',
  bulk_action: 'Bulk Action'
}
