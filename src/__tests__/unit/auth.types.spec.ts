/**
 * Unit tests for src/types/auth.ts
 *
 * Covers: ROLES constants, normalizeRole(), ADMIN_LOGIN_ERRORS
 *
 * Security relevance:
 *  F-14 — Role inconsistency: normalizeRole() is the single point that maps
 *          legacy/unknown strings to canonical values. A bug here could grant
 *          a 'viewer' super-admin privileges.
 *  F-05 — MFA: the store keys its login state machine off ADMIN_LOGIN_ERRORS;
 *          these codes must match the backend's `{ "error": ... }` payloads.
 */
import { describe, it, expect } from 'vitest'
import {
  ROLES,
  normalizeRole,
  ADMIN_LOGIN_ERRORS,
} from '@/types/auth'

// ─── ROLES constants ──────────────────────────────────────────────────────────

describe('ROLES constants', () => {
  it('defines the four canonical role identifiers', () => {
    expect(ROLES.SUPER_ADMIN).toBe('super_admin')
    expect(ROLES.APP_ADMIN).toBe('app_admin')
    expect(ROLES.APP_MANAGER).toBe('app_manager')
    expect(ROLES.VIEWER).toBe('viewer')
  })

  it('is frozen (as const) — all values are strings', () => {
    for (const value of Object.values(ROLES)) {
      expect(typeof value).toBe('string')
    }
  })
})

// ─── normalizeRole ────────────────────────────────────────────────────────────

describe('normalizeRole()', () => {
  // Canonical pass-through
  it('passes super_admin through unchanged', () => {
    expect(normalizeRole('super_admin')).toBe('super_admin')
  })
  it('passes app_admin through unchanged', () => {
    expect(normalizeRole('app_admin')).toBe('app_admin')
  })
  it('passes app_manager through unchanged', () => {
    expect(normalizeRole('app_manager')).toBe('app_manager')
  })
  it('passes viewer through unchanged', () => {
    expect(normalizeRole('viewer')).toBe('viewer')
  })

  // Legacy mappings — critical for F-14
  it('maps legacy "superadmin" → "super_admin"', () => {
    expect(normalizeRole('superadmin')).toBe('super_admin')
  })
  it('maps legacy "admin" → "app_admin"', () => {
    expect(normalizeRole('admin')).toBe('app_admin')
  })

  // Unknown input must never escalate — must fall back to lowest privilege
  it('maps completely unknown role → "viewer" (least privilege)', () => {
    expect(normalizeRole('root')).toBe('viewer')
    expect(normalizeRole('god')).toBe('viewer')
    expect(normalizeRole('SUPER_ADMIN')).toBe('viewer')    // case-sensitive
    expect(normalizeRole('SuperAdmin')).toBe('viewer')
  })

  it('maps empty string → "viewer"', () => {
    expect(normalizeRole('')).toBe('viewer')
  })

  it('maps whitespace string → "viewer"', () => {
    // Whitespace is not a valid role
    expect(normalizeRole('   ')).toBe('viewer')
  })

  it('maps injected role string → "viewer"', () => {
    // Ensure SQL injection-style inputs do not match a valid role
    expect(normalizeRole("super_admin'; DROP TABLE users;--")).toBe('viewer')
  })
})

// ─── ADMIN_LOGIN_ERRORS ───────────────────────────────────────────────────────

describe('ADMIN_LOGIN_ERRORS', () => {
  // These strings MUST match the backend's dto.ErrorResponse `error` values
  // (internal/handler/admin_auth_handler.go). The store's login state machine
  // branches on them; a drift here silently breaks the MFA flow (F-05).
  it('matches the backend mfa_required code', () => {
    expect(ADMIN_LOGIN_ERRORS.MFA_REQUIRED).toBe('mfa_required')
  })

  it('matches the backend invalid mfa code message', () => {
    expect(ADMIN_LOGIN_ERRORS.MFA_INVALID_CODE).toBe('invalid mfa code')
  })

  it('matches the backend mfa_enrollment_required code', () => {
    expect(ADMIN_LOGIN_ERRORS.MFA_ENROLLMENT_REQUIRED).toBe('mfa_enrollment_required')
  })
})
