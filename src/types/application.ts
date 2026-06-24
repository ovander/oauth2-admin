// ============================================================================
// App Types - matches /api/admin/apps endpoints
// ============================================================================

export interface App {
  id: number
  name: string
  client_id: string
  active: boolean
  url?: string
  redirect_uris: string[]
  owner_id?: number
  created_at: string
  is_public: boolean       // true = public client (SPA/mobile), no secret
  require_pkce: boolean    // always true when is_public; optional for confidential
}

// Returned only on create or rotate-secret
export interface AppWithSecret extends App {
  client_secret: string  // empty string for public clients — never display
}

export interface AppListResponse {
  apps: App[]
  total_count: number
}

export interface CreateAppRequest {
  name: string
  url?: string
  redirect_uris?: string[]
  is_public?: boolean  // true = public client; require_pkce auto-set server-side
}

export interface UpdateAppRequest {
  name?: string
  url?: string
  redirect_uris?: string[]
  active?: boolean
}

// ============================================================================
// App User Types - matches /api/apps/{app_id}/users endpoints
// ============================================================================

export type AppUserRole = 'user' | 'admin' | 'viewer' | (string & {})

export interface AppUser {
  id: number
  email: string
  name: string
  role: AppUserRole
  is_verified: boolean
  invite_sent: boolean
  last_login?: string
  created_at: string
}

export interface AppUserListResponse {
  users: AppUser[]
  total_count: number
  page: number
  page_size: number
}

export interface AddUserToAppRequest {
  email: string
  name?: string
  role: AppUserRole
}

export interface AddUserToAppResponse {
  user_id: number
  invite_token: string
  role: string
}

export interface UpdateUserRoleRequest {
  role: AppUserRole
}

export interface UpdateUserRoleResponse {
  role: string
}

// ============================================================================
// App Activity Logs - matches /api/apps/{app_id}/logs
// ============================================================================

export interface AppActivityLog {
  id: number
  app_id: number
  user_id: number
  event_type: string
  event_category: string
  metadata: Record<string, unknown>
  ip_address: string
  user_agent: string
  success: boolean
  created_at: string
}

export interface AppActivityLogResponse {
  logs: AppActivityLog[]
  total_count: number
  page: number
  page_size: number
}
