/**
 * Tests for src/composables/useClipboard.ts
 *
 * Security relevance (F-20):
 *  The old execCommand('copy') fallback was removed. These tests serve as
 *  a regression guard to ensure:
 *  1. document.execCommand is NEVER called
 *  2. Only navigator.clipboard.writeText is used
 *  3. Graceful error is shown when clipboard is unavailable (non-HTTPS context)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useClipboard } from '@/composables/useClipboard'

// ─── Mock useToast so we can assert on toast calls ────────────────────────────
const mockToast = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }
vi.mock('@/composables/useToast', () => ({
  useToast: () => mockToast,
}))

describe('useClipboard — no execCommand fallback (F-20)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── execCommand regression guard ─────────────────────────────────────────────
  // happy-dom does not implement document.execCommand, so we add a stub first
  // then spy on it.  The point: the composable must never reach this code path.

  it('NEVER calls document.execCommand', async () => {
    // Polyfill execCommand in happy-dom so we can spy on it
    if (!document.execCommand) {
      Object.defineProperty(document, 'execCommand', {
        value:        vi.fn().mockReturnValue(true),
        configurable: true,
        writable:     true,
      })
    }
    const execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })

    const { copy } = useClipboard()
    await copy('test text')

    expect(execCommandSpy).not.toHaveBeenCalled()
  })

  // ── Happy path: clipboard available ──────────────────────────────────────────

  it('calls navigator.clipboard.writeText with the provided text', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    })

    const { copy } = useClipboard()
    const result = await copy('sensitive-client-secret')

    expect(writeTextMock).toHaveBeenCalledWith('sensitive-client-secret')
    expect(result).toBe(true)
  })

  it('shows a success toast after copying', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })

    const { copy } = useClipboard()
    await copy('text', 'Client ID copied!')

    expect(mockToast.success).toHaveBeenCalledWith('Client ID copied!')
  })

  it('sets copied ref to true after successful copy', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })

    const { copy, copied } = useClipboard()
    await copy('some text')

    expect(copied.value).toBe(true)
  })

  // ── Clipboard API unavailable (non-HTTPS context) ────────────────────────────

  it('shows error toast and returns false when navigator.clipboard is undefined', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value:        undefined,
      configurable: true,
    })

    const { copy } = useClipboard()
    const result = await copy('text')

    expect(result).toBe(false)
    expect(mockToast.error).toHaveBeenCalledWith(
      'Clipboard access is not available in this browser or context',
    )
  })

  // ── Clipboard API throws (permission denied) ──────────────────────────────────

  it('shows error toast and returns false when writeText throws', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) },
      configurable: true,
    })

    const { copy } = useClipboard()
    const result = await copy('text')

    expect(result).toBe(false)
    expect(mockToast.error).toHaveBeenCalledWith(
      'Failed to copy to clipboard. Please copy manually.',
    )
  })
})
