import { ROLES, normalizeRole, type UserRole } from '@/types/auth'

/** Returns true when the supplied role has superadmin privileges */
export function isSuperAdminRole(role: string | undefined | null): boolean {
  if (!role) return false
  return normalizeRole(role) === ROLES.SUPER_ADMIN
}

/** Returns true when the supplied role can manage app-level users */
export function canManageUsersRole(role: string | undefined | null): boolean {
  if (!role) return false
  const r = normalizeRole(role)
  return r === ROLES.SUPER_ADMIN || r === ROLES.APP_ADMIN || r === ROLES.APP_MANAGER
}

/** Returns true when the role has any app-admin capability */
export function isAppAdminRole(role: string | undefined | null): boolean {
  if (!role) return false
  const r = normalizeRole(role)
  return r === ROLES.SUPER_ADMIN || r === ROLES.APP_ADMIN
}

/** Human-readable label for a role */
export function roleLabel(role: string | undefined | null): string {
  if (!role) return 'Unknown'
  const labels: Record<UserRole, string> = {
    [ROLES.SUPER_ADMIN]: 'Super Admin',
    [ROLES.APP_ADMIN]:   'App Admin',
    [ROLES.APP_MANAGER]: 'App Manager',
    [ROLES.VIEWER]:      'Viewer',
  }
  const normalized = normalizeRole(role)
  return labels[normalized] ?? role
}
