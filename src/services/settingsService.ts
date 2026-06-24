import api from './api'

export interface ServerConfig {
  issuer_url: string
  access_token_ttl: number
  refresh_token_ttl: number
  rate_limit_requests: number
  rate_limit_window: number
  environment: 'development' | 'staging' | 'production'
  version: string
  features: {
    mfa_enabled: boolean
    password_policy_enabled: boolean
    audit_logging_enabled: boolean
  }
}

export async function getServerConfig(): Promise<ServerConfig> {
  const response = await api.get<ServerConfig>('/api/admin/settings/config')
  return response.data
}

export async function testDatabaseConnection(): Promise<{ status: 'ok' | 'error'; latency_ms: number }> {
  const response = await api.get('/api/admin/settings/test-db')
  return response.data
}

export async function testCacheConnection(): Promise<{ status: 'ok' | 'error'; latency_ms: number }> {
  const response = await api.get('/api/admin/settings/test-cache')
  return response.data
}
