/**
 * Unit tests for src/types/auth.ts
 *
 * Covers: ROLES constants, normalizeRole(), isMfaChallenge()
 *
 * Security relevance:
 *  F-14 — Role inconsistency: normalizeRole() is the single point that maps
 *          legacy/unknown strings to canonical values. A bug here could grant
 *          a 'viewer' super-admin privileges.
 *  F-05 — MFA: isMfaChallenge() is the type-guard that decides whether to
 *          demand a second factor. A broken guard bypasses MFA entirely.
 */
import { describe, it, expect } from 'vitest'
import {
  ROLES,
  normalizeRole,
  isMfaChallenge,
  type LoginResponse,
  type MfaChallengeResponse,
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

// ─── isMfaChallenge ───────────────────────────────────────────────────────────

describe('isMfaChallenge()', () => {
  const mfaResponse: MfaChallengeResponse = {
    requires_mfa: true,
    mfa_token:    'short-lived-server-token',
    mfa_type:     'totp',
    user_email:   'admin@example.com',
  }

  const loginResponse: LoginResponse = {
    access_token: 'eyJhbGciOiJSUzI1NiJ9.test',
    token_type:   'Bearer',
    expires_in:   900,
  }

  it('returns true for a genuine MFA challenge response', () => {
    expect(isMfaChallenge(mfaResponse)).toBe(true)
  })

  it('returns false for a full login response (no second factor required)', () => {
    expect(isMfaChallenge(loginResponse)).toBe(false)
  })

  it('returns false when requires_mfa is absent', () => {
    const partial = { access_token: 'at', token_type: 'Bearer', expires_in: 900 }
    expect(isMfaChallenge(partial)).toBe(false)
  })

  it('returns false when requires_mfa is false (explicit)', () => {
    // Backend explicitly says no MFA needed
    const noMfa = { requires_mfa: false } as unknown as LoginResponse
    expect(isMfaChallenge(noMfa)).toBe(false)
  })

  it('returns false when requires_mfa is a truthy non-boolean (defensive)', () => {
    // Guard must be strict — only `true` qualifies
    const suspicious = { requires_mfa: 1 } as unknown as MfaChallengeResponse
    // The implementation checks === true, so this should be false
    expect(isMfaChallenge(suspicious)).toBe(false)
  })
})
