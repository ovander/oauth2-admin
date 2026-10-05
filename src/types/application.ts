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
  magic_link_url?: string  // page magic-link emails open (Socrate v1.6.0+); absent = not configured
  // Token settings (Socrate A2 / RFC-001 / v1.8.0). Absent on older servers.
  audiences?: string[]               // added to the token's aud after client_id when AUDIENCE_MODE=dual
  allowed_scopes?: string[]          // the only scopes the client may request; empty = unrestricted
  claim_mappings?: ClaimMappings     // custom claims, issued under Socrate's CLAIMS_NAMESPACE
  access_token_ttl_seconds?: number  // shorter access-token lifetime for this client; absent = server default
}

/** ClaimTarget is the token(s) a mapped claim is written to. */
export type ClaimTarget = 'access' | 'id' | 'both'

/**
 * ClaimMapping projects one server-held value into a token claim: either the
 * source string (target "access") or the object form.
 */
export type ClaimMapping = string | { source: string; target?: ClaimTarget }

/** ClaimMappings is keyed by the unqualified claim name. */
export type ClaimMappings = Record<string, ClaimMapping>

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
  require_pkce?: boolean  // confidential clients only; cannot be changed after creation
  magic_link_url?: string
  audiences?: string[]
  allowed_scopes?: string[]
  claim_mappings?: ClaimMappings
  access_token_ttl_seconds?: number
}

export interface UpdateAppRequest {
  name?: string
  url?: string
  redirect_uris?: string[]
  active?: boolean
  magic_link_url?: string  // '' clears it; omitted leaves it unchanged
  // For each of these, omitted leaves it unchanged and an empty value clears it.
  audiences?: string[]
  allowed_scopes?: string[]
  claim_mappings?: ClaimMappings
  access_token_ttl_seconds?: number  // 0 clears it
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
