/**
 * Unit tests for src/services/adminGuards.ts
 *
 * Covers the client side of the Tier-0 step-up (elevation) state machine and
 * the forced-password-change flag (go-oauth2 ADMIN-SPA-MIGRATION.md §5–§6).
 *
 * Under the BFF model, step-up posts to `/bff/elevate` (services/session.ts);
 * the BFF absorbs the elevated token into the session, so there is no token to
 * swap into the browser anymore — success simply resolves the waiters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bffElevate } from '@/services/session'
import {
  elevationVisible,
  elevationLoading,
  elevationError,
  elevationMfaRequired,
  requireElevation,
  submitElevation,
  cancelElevation,
  ElevationCancelled,
  passwordChangeRequired,
  flagPasswordChangeRequired,
  clearPasswordChangeRequired,
} from '@/services/adminGuards'

vi.mock('@/services/session', () => ({
  bffElevate: vi.fn(),
}))

beforeEach(() => {
  clearPasswordChangeRequired()
  // Ensure no prompt leaks across tests.
  if (elevationVisible.value) cancelElevation()
})

// ─── Elevation ────────────────────────────────────────────────────────────────
describe('adminGuards — requireElevation()', () => {
  it('opens the prompt and stays pending until resolved', async () => {
    let settled = false
    const p = requireElevation().then(() => { settled = true })

    expect(elevationVisible.value).toBe(true)
    await Promise.resolve()
    expect(settled).toBe(false)

    // Resolve it so the test doesn't leak a pending promise.
    vi.mocked(bffElevate).mockResolvedValueOnce(undefined)
    await submitElevation('correct-password')
    await p
    expect(settled).toBe(true)
  })

  it('shares a single prompt across concurrent callers', async () => {
    const a = requireElevation()
    const b = requireElevation()
    expect(elevationVisible.value).toBe(true)

    vi.mocked(bffElevate).mockResolvedValueOnce(undefined)
    await submitElevation('correct-password')

    await expect(Promise.all([a, b])).resolves.toEqual([undefined, undefined])
  })
})

describe('adminGuards — submitElevation()', () => {
  it('elevates the BFF session, resolves waiters, and closes the prompt', async () => {
    vi.mocked(bffElevate).mockResolvedValueOnce(undefined)
    const done = requireElevation()

    await submitElevation('correct-password')
    await done

    expect(bffElevate).toHaveBeenCalledWith('correct-password', undefined)
    expect(elevationVisible.value).toBe(false)
    expect(elevationLoading.value).toBe(false)
  })

  it('reveals the MFA field on mfa_required without resolving', async () => {
    vi.mocked(bffElevate).mockRejectedValueOnce({ response: { data: { error: 'mfa_required' } } })
    let settled = false
    requireElevation().then(() => { settled = true }).catch(() => { /* cancelled in teardown */ })

    await submitElevation('correct-password')

    expect(elevationMfaRequired.value).toBe(true)
    expect(elevationVisible.value).toBe(true)   // still open
    expect(settled).toBe(false)
    expect(elevationError.value).toMatch(/authenticator/i)

    // Now complete it with the code.
    vi.mocked(bffElevate).mockResolvedValueOnce(undefined)
    await submitElevation('correct-password', '123456')
    expect(bffElevate).toHaveBeenLastCalledWith('correct-password', '123456')
    expect(elevationVisible.value).toBe(false)
  })

  it('shows an "invalid code" message on a wrong MFA code', async () => {
    vi.mocked(bffElevate).mockRejectedValueOnce({ response: { data: { error: 'invalid mfa code' } } })
    const pending = requireElevation().catch(() => { /* cancelled below */ })

    await submitElevation('correct-password', '000000')

    expect(elevationError.value).toMatch(/invalid code/i)
    expect(elevationVisible.value).toBe(true)
    cancelElevation()
    await pending
  })
})

describe('adminGuards — cancelElevation()', () => {
  it('rejects waiters with ElevationCancelled and closes the prompt', async () => {
    const p = requireElevation()
    cancelElevation()

    await expect(p).rejects.toBeInstanceOf(ElevationCancelled)
    expect(elevationVisible.value).toBe(false)
  })
})

// ─── Forced password change ───────────────────────────────────────────────────
describe('adminGuards — password change flag', () => {
  it('flags and clears the forced-password-change gate', () => {
    expect(passwordChangeRequired.value).toBe(false)
    flagPasswordChangeRequired()
    expect(passwordChangeRequired.value).toBe(true)
    clearPasswordChangeRequired()
    expect(passwordChangeRequired.value).toBe(false)
  })
})
