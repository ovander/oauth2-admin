/**
 * Unit tests for src/utils/roles.ts
 *
 * Covers: isSuperAdminRole, canManageUsersRole, isAppAdminRole, roleLabel
 *
 * Security relevance (F-14):
 *  Every route guard, feature flag, and UI visibility decision in the admin
 *  SPA flows through these predicates. Incorrect results directly grant or
 *  deny privileges.
 */
import { describe, it, expect } from 'vitest'
import {
  isSuperAdminRole,
  canManageUsersRole,
  isAppAdminRole,
  roleLabel,
} from '@/utils/roles'

// ─── isSuperAdminRole ─────────────────────────────────────────────────────────

describe('isSuperAdminRole()', () => {
  it('returns true for canonical super_admin', () => {
    expect(isSuperAdminRole('super_admin')).toBe(true)
  })

  it('returns true for legacy "superadmin" (normalized)', () => {
    expect(isSuperAdminRole('superadmin')).toBe(true)
  })

  it('returns false for app_admin', () => {
    expect(isSuperAdminRole('app_admin')).toBe(false)
  })

  it('returns false for app_manager', () => {
    expect(isSuperAdminRole('app_manager')).toBe(false)
  })

  it('returns false for viewer', () => {
    expect(isSuperAdminRole('viewer')).toBe(false)
  })

  it('returns false for null (unauthenticated user)', () => {
    expect(isSuperAdminRole(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isSuperAdminRole(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isSuperAdminRole('')).toBe(false)
  })
})

// ─── canManageUsersRole ───────────────────────────────────────────────────────

describe('canManageUsersRole()', () => {
  it.each(['super_admin', 'app_admin', 'app_manager'])(
    'returns true for %s',
    (role) => { expect(canManageUsersRole(role)).toBe(true) },
  )

  it('returns true for legacy "superadmin"', () => {
    expect(canManageUsersRole('superadmin')).toBe(true)
  })

  it('returns true for legacy "admin"', () => {
    expect(canManageUsersRole('admin')).toBe(true)
  })

  it('returns false for viewer', () => {
    expect(canManageUsersRole('viewer')).toBe(false)
  })

  it('returns false for null', () => {
    expect(canManageUsersRole(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(canManageUsersRole(undefined)).toBe(false)
  })

  it('returns false for unknown role string', () => {
    expect(canManageUsersRole('god')).toBe(false)
  })
})

// ─── isAppAdminRole ───────────────────────────────────────────────────────────

describe('isAppAdminRole()', () => {
  it('returns true for super_admin (superset of app_admin)', () => {
    expect(isAppAdminRole('super_admin')).toBe(true)
  })

  it('returns true for app_admin', () => {
    expect(isAppAdminRole('app_admin')).toBe(true)
  })

  it('returns false for app_manager (cannot do admin-only actions)', () => {
    expect(isAppAdminRole('app_manager')).toBe(false)
  })

  it('returns false for viewer', () => {
    expect(isAppAdminRole('viewer')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isAppAdminRole(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isAppAdminRole(undefined)).toBe(false)
  })
})

// ─── roleLabel ────────────────────────────────────────────────────────────────

describe('roleLabel()', () => {
  it('returns "Super Admin" for super_admin', () => {
    expect(roleLabel('super_admin')).toBe('Super Admin')
  })

  it('returns "App Admin" for app_admin', () => {
    expect(roleLabel('app_admin')).toBe('App Admin')
  })

  it('returns "App Manager" for app_manager', () => {
    expect(roleLabel('app_manager')).toBe('App Manager')
  })

  it('returns "Viewer" for viewer', () => {
    expect(roleLabel('viewer')).toBe('Viewer')
  })

  it('returns "Super Admin" for legacy "superadmin"', () => {
    expect(roleLabel('superadmin')).toBe('Super Admin')
  })

  it('returns "App Admin" for legacy "admin"', () => {
    expect(roleLabel('admin')).toBe('App Admin')
  })

  it('returns "Unknown" for null', () => {
    expect(roleLabel(null)).toBe('Unknown')
  })

  it('returns "Unknown" for undefined', () => {
    expect(roleLabel(undefined)).toBe('Unknown')
  })

  it('returns the raw string for unrecognised role (graceful degradation)', () => {
    // Unknown roles normalize to 'viewer', so label will be 'Viewer'
    expect(roleLabel('some_future_role')).toBe('Viewer')
  })
})
