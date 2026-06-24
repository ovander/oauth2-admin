/**
 * Tests for src/composables/useSessionTimeout.ts
 *
 * Uses Vitest's fake timers to control setInterval / setTimeout without
 * waiting real wall-clock time.
 *
 * Security relevance (F-06):
 *  The session timeout is the primary defence against unattended-terminal
 *  attacks. If the countdown doesn't fire or dismissal doesn't cancel the
 *  expiry, a dormant session remains accessible after the intended window.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

// ─── Mock @vueuse/core useIdle ────────────────────────────────────────────────
// We control when the user appears idle by flipping this ref
const idleRef      = ref(false)
const lastActiveRef = ref(Date.now())

vi.mock('@vueuse/core', () => ({
  useIdle: () => ({ idle: idleRef, lastActive: lastActiveRef }),
}))

import { useSessionTimeout } from '@/composables/useSessionTimeout'

// Constants mirrored from the composable (not exported, so we reproduce them)
const WARNING_LEAD_MS = 2 * 60 * 1000   // 2 minutes
const WARNING_LEAD_S  = WARNING_LEAD_MS / 1000   // 120 seconds

describe('useSessionTimeout (F-06)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    idleRef.value = false
  })

  afterEach(() => {
    vi.useRealTimers()
    idleRef.value = false
  })

  // ── Initial state ────────────────────────────────────────────────────────────

  it('does not show warning on mount', () => {
    const onExpire = vi.fn()
    const { showWarning } = useSessionTimeout(onExpire)
    expect(showWarning.value).toBe(false)
  })

  it('secondsLeft starts at 120 (WARNING_LEAD_MS / 1000)', () => {
    const { secondsLeft } = useSessionTimeout(vi.fn())
    expect(secondsLeft.value).toBe(WARNING_LEAD_S)
  })

  // ── Idle triggers warning ────────────────────────────────────────────────────

  it('shows warning when user becomes idle', async () => {
    const { showWarning } = useSessionTimeout(vi.fn())

    idleRef.value = true
    await Promise.resolve() // flush watchers

    expect(showWarning.value).toBe(true)
  })

  // ── Countdown ticks down ─────────────────────────────────────────────────────

  it('decrements secondsLeft every second while warning is shown', async () => {
    const { secondsLeft } = useSessionTimeout(vi.fn())

    idleRef.value = true
    await Promise.resolve()

    vi.advanceTimersByTime(5_000)
    expect(secondsLeft.value).toBe(WARNING_LEAD_S - 5)
  })

  // ── Expiry fires onExpire ────────────────────────────────────────────────────

  it('calls onExpire after the full warning period elapses', async () => {
    const onExpire = vi.fn()
    const { showWarning } = useSessionTimeout(onExpire)

    idleRef.value = true
    await Promise.resolve()

    vi.advanceTimersByTime(WARNING_LEAD_MS)
    await Promise.resolve()

    expect(onExpire).toHaveBeenCalledOnce()
    expect(showWarning.value).toBe(false)
  })

  // ── Dismiss cancels expiry ───────────────────────────────────────────────────

  it('dismissWarning() hides the modal and cancels expiry', async () => {
    const onExpire = vi.fn()
    const { showWarning, dismissWarning } = useSessionTimeout(onExpire)

    idleRef.value = true
    await Promise.resolve()

    expect(showWarning.value).toBe(true)

    dismissWarning()
    expect(showWarning.value).toBe(false)

    // Advance past the original expiry window — onExpire must NOT fire
    vi.advanceTimersByTime(WARNING_LEAD_MS + 1_000)
    await Promise.resolve()

    expect(onExpire).not.toHaveBeenCalled()
  })

  it('dismissWarning() resets secondsLeft to the full warning duration', async () => {
    const { secondsLeft, dismissWarning } = useSessionTimeout(vi.fn())

    idleRef.value = true
    await Promise.resolve()
    vi.advanceTimersByTime(30_000) // let 30s tick down

    dismissWarning()
    expect(secondsLeft.value).toBe(WARNING_LEAD_S)
  })

  // ── User activity during warning cancels expiry ───────────────────────────────

  it('dismisses automatically when user becomes active again before expiry', async () => {
    const onExpire = vi.fn()
    const { showWarning } = useSessionTimeout(onExpire)

    idleRef.value = true
    await Promise.resolve()
    expect(showWarning.value).toBe(true)

    // User moves the mouse — idle becomes false
    idleRef.value = false
    await Promise.resolve()

    expect(showWarning.value).toBe(false)

    vi.advanceTimersByTime(WARNING_LEAD_MS + 5_000)
    await Promise.resolve()

    expect(onExpire).not.toHaveBeenCalled()
  })
})
