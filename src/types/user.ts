// ============================================================================
// Global User Types - matches /api/admin/users endpoints
// ============================================================================

export type GlobalUserRole = 'superadmin' | 'user'  // Global role only

export interface GlobalUser {
  id: number
  email: string
  name: string
  role: GlobalUserRole  // Global role (superadmin manages server, user can be admin/user in apps)
  is_verified: boolean
  created_at: string
}

export interface GlobalUserListResponse {
  users: GlobalUser[]
  total_count: number
  page: number
  page_size: number
}

export interface GlobalUserListFilters {
  page?: number
  page_size?: number
}

// ============================================================================
// User App Memberships - matches /api/admin/users/{id}/apps
// ============================================================================

export interface UserAppMembership {
  app_id: number
  app_name: string
  client_id: string
  role: 'admin' | 'user'  // Role within the app
  created_at: string
}

export interface UserAppMembershipsResponse {
  user_id: number
  email: string
  name: string
  memberships: UserAppMembership[]
  total_count: number
}

// ============================================================================
// Superadmin Types - matches /api/admin/superadmins endpoints
// ============================================================================

export interface Superadmin {
  id: number
  email: string
  name: string
  is_verified: boolean
  last_login?: string
  failed_logins: number
  locked_until?: string
  created_at: string
  updated_at: string
}

export interface SuperadminListResponse {
  superadmins: Superadmin[]
  total_count: number
}

export interface CreateSuperadminRequest {
  email: string
  name: string
  password: string
}

export interface UpdateSuperadminRequest {
  name?: string
  email?: string
  password?: string
}

// ============================================================================
// Admin Activity Log Types - matches /api/admin/activity
// ============================================================================

export type AdminActionType =
  | 'add_user'
  | 'remove_user'
  | 'update_role'
  | 'resend_verification'
  | 'reset_password'
  | 'revoke_tokens'
  | 'unlock_user'
  | 'create_superadmin'
  | 'update_superadmin'
  | 'delete_superadmin'

export interface AdminActivityLog {
  id: number
  admin_id: number
  app_id?: number
  target_user_id?: number
  action: AdminActionType
  details: Record<string, unknown>
  created_at: string
}

export interface AdminActivityLogResponse {
  logs: AdminActivityLog[]
  total_count: number
  page: number
  page_size: number
}

// ============================================================================
// Admin Stats - matches /api/admin/stats
// ============================================================================

export interface AdminStats {
  total_users: number
  total_apps: number
}

// ============================================================================
// Legacy compatibility types (can be removed after migration)
// ============================================================================

export interface AdminUser extends GlobalUser {
  apps_count?: number
}

export interface UserListResponse {
  users: GlobalUser[]
  total_count: number
  page: number
  page_size: number
}

export interface UserListFilters {
  page?: number
  page_size?: number
}

export interface CreateUserRequest {
  email: string
  name: string
  password: string
  role?: GlobalUserRole
}

export interface UpdateUserRequest {
  name?: string
  email?: string
  role?: GlobalUserRole
}

export interface BulkUserAction {
  user_ids: number[]
  action: 'lock' | 'unlock' | 'send_verification' | 'delete'
}

export interface UserStats {
  total_users: number
  verified_users: number
  pending_users: number
  locked_users: number
  new_users_today: number
  new_users_week: number
}
