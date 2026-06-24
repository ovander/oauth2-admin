/**
 * Admin session guards — client side of the Tier-0 step-up (elevation) and
 * forced-password-change controls (go-oauth2 ADMIN-SPA-MIGRATION.md §5–§6).
 *
 * This module is the bridge between the axios 403 interceptor (api.ts) and the
 * global UI (ElevationDialog, the change-password route). It holds reactive
 * state outside any component so both can coordinate.
 */
import { ref } from 'vue'
import * as authService from './authService'
import { tokenStore } from './api'

// ─── Error shape helpers ──────────────────────────────────────────────────────
export function challengeCode(err: unknown): string | undefined {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error
}
function challengeMessage(err: unknown): string | undefined {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message
}

// ─── Step-up / elevation ──────────────────────────────────────────────────────
export const elevationVisible     = ref(false)
export const elevationLoading     = ref(false)
export const elevationError       = ref<string | null>(null)
export const elevationMfaRequired = ref(false)

interface Deferred { resolve: () => void; reject: (err?: unknown) => void }
let waiters: Deferred[] = []

/** Thrown when the admin dismisses the elevation prompt. */
export class ElevationCancelled extends Error {
  constructor() {
    super('elevation_cancelled')
    this.name = 'ElevationCancelled'
  }
}

/**
 * Called by the 403 `elevation_required` interceptor: open the step-up prompt
 * and resolve once a fresh elevated token has been obtained (and swapped into
 * tokenStore), so the caller can retry. Concurrent callers share one prompt.
 */
export function requireElevation(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    waiters.push({ resolve, reject })
    if (!elevationVisible.value) {
      elevationError.value       = null
      elevationMfaRequired.value = false
      elevationVisible.value     = true
    }
  })
}

/** Submit the step-up credentials. On success, swaps in the fresh token. */
export async function submitElevation(password: string, mfaCode?: string): Promise<void> {
  elevationLoading.value = true
  elevationError.value   = null
  try {
    const token = await authService.elevate(password, mfaCode)
    tokenStore.set(token)
    finishElevation('resolve')
  } catch (err: unknown) {
    const code = challengeCode(err)
    if (code === 'mfa_required') {
      elevationMfaRequired.value = true
      elevationError.value = 'Enter the 6-digit code from your authenticator app.'
    } else if (code === 'invalid mfa code') {
      elevationError.value = 'Invalid code. Please try again.'
    } else {
      elevationError.value = challengeMessage(err) ?? 'Verification failed. Please try again.'
    }
  } finally {
    elevationLoading.value = false
  }
}

/** Dismiss the prompt — rejects all waiters so their actions are abandoned. */
export function cancelElevation(): void {
  finishElevation('reject')
}

function finishElevation(outcome: 'resolve' | 'reject'): void {
  const pending = waiters
  waiters = []
  elevationVisible.value     = false
  elevationLoading.value     = false
  elevationMfaRequired.value = false
  elevationError.value       = null
  if (outcome === 'resolve') pending.forEach(w => w.resolve())
  else                       pending.forEach(w => w.reject(new ElevationCancelled()))
}

// ─── Forced password change ───────────────────────────────────────────────────
/**
 * Set when any `/api/admin/*` call returns `403 password_change_required`. The
 * router guard and the global watcher route the admin to the change-password
 * page until it is cleared (after a successful change + fresh login).
 */
export const passwordChangeRequired = ref(false)

export function flagPasswordChangeRequired(): void { passwordChangeRequired.value = true }
export function clearPasswordChangeRequired(): void { passwordChangeRequired.value = false }
