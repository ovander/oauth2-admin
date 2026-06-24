import api from './api'
import type {
  GlobalUser,
  GlobalUserListResponse,
  GlobalUserListFilters,
  UserAppMembershipsResponse,
  Superadmin,
  SuperadminListResponse,
  CreateSuperadminRequest,
  UpdateSuperadminRequest,
  AdminActivityLogResponse,
  AdminStats
} from '@/types/user'

// ============================================================================
// Global User Management - /api/admin/users (Superadmin only)
// ============================================================================

/**
 * GET /api/admin/users
 * List all users in the system (requires global admin)
 */
export async function getUsers(filters?: GlobalUserListFilters): Promise<GlobalUserListResponse> {
  const response = await api.get<GlobalUserListResponse>('/api/admin/users', { params: filters })
  return response.data
}

/**
 * GET /api/admin/users/{id}
 * Get user details (requires global admin)
 */
export async function getUser(id: number): Promise<GlobalUser> {
  const response = await api.get<GlobalUser>(`/api/admin/users/${id}`)
  return response.data
}

/**
 * GET /api/admin/users/{id}/apps
 * Get all apps a user belongs to with their roles
 */
export async function getUserApps(id: number): Promise<UserAppMembershipsResponse> {
  const response = await api.get<UserAppMembershipsResponse>(`/api/admin/users/${id}/apps`)
  return response.data
}

/**
 * POST /api/admin/users/{id}/revoke-tokens
 * Invalidate all tokens for a user, forcing re-authentication
 */
export async function revokeUserTokens(id: number): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>(`/api/admin/users/${id}/revoke-tokens`)
  return response.data
}

/**
 * POST /api/admin/users/{id}/unlock
 * Unlock a user account that was locked due to failed login attempts
 */
export async function unlockUser(id: number): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>(`/api/admin/users/${id}/unlock`)
  return response.data
}

/**
 * POST /api/admin/users/{id}/block
 * Permanently block a user (sets locked_until 100 years ahead).
 * Cannot block superadmins — backend returns 403.
 */
export async function blockUser(id: number): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>(`/api/admin/users/${id}/block`)
  return response.data
}

/**
 * DELETE /api/admin/users/{id}
 * Permanently delete a user account and all their data.
 * Cannot delete yourself or superadmins via this route.
 */
export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/api/admin/users/${id}`)
}

// ============================================================================
// Superadmin Management - /api/admin/superadmins
// ============================================================================

/**
 * GET /api/admin/superadmins
 * List all superadmin users
 */
export async function getSuperadmins(): Promise<SuperadminListResponse> {
  const response = await api.get<SuperadminListResponse>('/api/admin/superadmins')
  return response.data
}

/**
 * GET /api/admin/superadmins/{id}
 * Get superadmin details
 */
export async function getSuperadmin(id: number): Promise<Superadmin> {
  const response = await api.get<Superadmin>(`/api/admin/superadmins/${id}`)
  return response.data
}

/**
 * POST /api/admin/superadmins
 * Create a new superadmin account (auto-verified)
 */
export async function createSuperadmin(data: CreateSuperadminRequest): Promise<Superadmin> {
  const response = await api.post<Superadmin>('/api/admin/superadmins', data)
  return response.data
}

/**
 * PUT /api/admin/superadmins/{id}
 * Update superadmin account
 */
export async function updateSuperadmin(id: number, data: UpdateSuperadminRequest): Promise<Superadmin> {
  const response = await api.put<Superadmin>(`/api/admin/superadmins/${id}`, data)
  return response.data
}

/**
 * DELETE /api/admin/superadmins/{id}
 * Delete superadmin account
 * NOTE: Cannot delete yourself or the last superadmin
 */
export async function deleteSuperadmin(id: number): Promise<void> {
  await api.delete(`/api/admin/superadmins/${id}`)
}

// ============================================================================
// Admin Activity Log - /api/admin/activity
// ============================================================================

/**
 * GET /api/admin/activity
 * Get activity log for the current admin's actions
 */
export async function getAdminActivityLog(params?: {
  page?: number
  page_size?: number
}): Promise<AdminActivityLogResponse> {
  const response = await api.get<AdminActivityLogResponse>('/api/admin/activity', { params })
  return response.data
}

// ============================================================================
// Admin Stats - /api/admin/stats
// ============================================================================

/**
 * GET /api/admin/stats
 * Get quick statistics for the current admin
 */
export async function getAdminStats(): Promise<AdminStats> {
  const response = await api.get<AdminStats>('/api/admin/stats')
  return response.data
}

// ============================================================================
// Action Type Labels (for display)
// ============================================================================

export const adminActionLabels: Record<string, string> = {
  add_user: 'Added User',
  remove_user: 'Removed User',
  update_role: 'Updated Role',
  resend_verification: 'Resent Verification',
  reset_password: 'Reset Password',
  revoke_tokens: 'Revoked Tokens',
  unlock_user: 'Unlocked User',
  block_user: 'Blocked User',
  delete_user: 'Deleted User',
  create_superadmin: 'Created Superadmin',
  update_superadmin: 'Updated Superadmin',
  delete_superadmin: 'Deleted Superadmin',
}
