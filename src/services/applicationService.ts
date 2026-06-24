import api from './api'
import type {
  App,
  AppWithSecret,
  AppListResponse,
  CreateAppRequest,
  UpdateAppRequest,
  AppUser,
  AppUserListResponse,
  AddUserToAppRequest,
  AddUserToAppResponse,
  UpdateUserRoleRequest,
  UpdateUserRoleResponse,
  AppActivityLogResponse
} from '@/types/application'

// ============================================================================
// OAuth App Management - /api/admin/apps
// ============================================================================

/**
 * GET /api/admin/apps
 * List ALL OAuth apps in the system (superadmin sees all)
 */
export async function getApps(): Promise<AppListResponse> {
  const response = await api.get<AppListResponse>('/api/admin/apps')
  return response.data
}

/**
 * GET /api/admin/apps/{id}
 * Get app details by ID
 */
export async function getApp(id: number): Promise<App> {
  const response = await api.get<App>(`/api/admin/apps/${id}`)
  return response.data
}

/**
 * POST /api/admin/apps
 * Create a new OAuth app
 * NOTE: client_secret is only returned here - store it immediately!
 */
export async function createApp(data: CreateAppRequest): Promise<AppWithSecret> {
  const response = await api.post<AppWithSecret>('/api/admin/apps', data)
  return response.data
}

/**
 * PUT /api/admin/apps/{id}
 * Update an existing app
 */
export async function updateApp(id: number, data: UpdateAppRequest): Promise<App> {
  const response = await api.put<App>(`/api/admin/apps/${id}`, data)
  return response.data
}

/**
 * DELETE /api/admin/apps/{id}
 * Permanently delete an app (invalidates all tokens)
 */
export async function deleteApp(id: number): Promise<void> {
  await api.delete(`/api/admin/apps/${id}`)
}

/**
 * POST /api/admin/apps/{id}/rotate-secret
 * Generate a new client secret (invalidates old one)
 * NOTE: New secret is only returned here - store it immediately!
 */
export async function rotateAppSecret(id: number): Promise<AppWithSecret> {
  const response = await api.post<AppWithSecret>(`/api/admin/apps/${id}/rotate-secret`)
  return response.data
}

// ============================================================================
// App-Scoped User Management - /api/apps/{app_id}/users
// ============================================================================

/**
 * GET /api/apps/{app_id}/users
 * List users in a specific app with pagination and search
 */
export async function getAppUsers(
  appId: number,
  params?: {
    page?: number
    page_size?: number
    search?: string
  }
): Promise<AppUserListResponse> {
  const response = await api.get<AppUserListResponse>(`/api/apps/${appId}/users`, { params })
  return response.data
}

/**
 * GET /api/apps/{app_id}/users/{user_id}
 * Get a specific user in an app
 */
export async function getAppUser(appId: number, userId: number): Promise<AppUser> {
  const response = await api.get<AppUser>(`/api/apps/${appId}/users/${userId}`)
  return response.data
}

/**
 * POST /api/apps/{app_id}/users
 * Add a user to an app (creates account if doesn't exist)
 * Returns invite_token for the user to set up their account
 */
export async function addUserToApp(appId: number, data: AddUserToAppRequest): Promise<AddUserToAppResponse> {
  const response = await api.post<AddUserToAppResponse>(`/api/apps/${appId}/users`, data)
  return response.data
}

/**
 * PUT /api/apps/{app_id}/users/{user_id}
 * Update a user's role in an app
 */
export async function updateAppUserRole(
  appId: number,
  userId: number,
  data: UpdateUserRoleRequest
): Promise<UpdateUserRoleResponse> {
  const response = await api.put<UpdateUserRoleResponse>(`/api/apps/${appId}/users/${userId}`, data)
  return response.data
}

/**
 * DELETE /api/apps/{app_id}/users/{user_id}
 * Remove a user from an app (cannot remove yourself)
 */
export async function removeUserFromApp(appId: number, userId: number): Promise<void> {
  await api.delete(`/api/apps/${appId}/users/${userId}`)
}

/**
 * POST /api/apps/{app_id}/users/{user_id}/resend-verification
 * Resend email verification to a user
 */
export async function resendVerificationEmail(appId: number, userId: number): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>(`/api/apps/${appId}/users/${userId}/resend-verification`)
  return response.data
}

/**
 * POST /api/apps/{app_id}/users/{user_id}/reset-password
 * Force password reset for a user (sends reset email)
 */
export async function forcePasswordReset(appId: number, userId: number): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>(`/api/apps/${appId}/users/${userId}/reset-password`)
  return response.data
}

// ============================================================================
// App Activity Logs - /api/apps/{app_id}/logs
// ============================================================================

/**
 * GET /api/apps/{app_id}/logs
 * Get activity logs for an app (requires app admin or global admin).
 */
export async function getAppActivityLogs(
  appId: number,
  params?: {
    page?: number
    page_size?: number
  }
): Promise<AppActivityLogResponse> {
  const response = await api.get<AppActivityLogResponse>(`/api/apps/${appId}/logs`, { params })
  return response.data
}
