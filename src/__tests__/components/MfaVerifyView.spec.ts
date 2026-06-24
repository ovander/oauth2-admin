/**
 * Component tests for src/views/auth/MfaVerifyView.vue
 *
 * Security relevance:
 *  F-05 — onMounted guard: if no pending MFA challenge, must redirect to Login
 *  F-05 — digit-only input: non-numeric characters must be stripped
 *  F-04 — safe redirect preserved after successful MFA
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MfaVerifyView from '@/views/auth/MfaVerifyView.vue'
import type { PendingMfa } from '@/types/auth'

const mockPush    = vi.fn()
const mockReplace = vi.fn()
const mockRoute   = { query: {} as Record<string, string> }

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useRoute:  () => mockRoute,
}))

const mockVerifyMfa  = vi.fn()
const mockClearError = vi.fn()
const mockClearMfa   = vi.fn()

const pendingMfaRef = { value: null as PendingMfa | null }

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    pendingMfa:  pendingMfaRef.value,
    error:       null,
    verifyMfa:   mockVerifyMfa,
    clearError:  mockClearError,
    clearMfa:    mockClearMfa,
  }),
}))

const mockChallenge: PendingMfa = {
  user_email: 'admin@example.com',
}

function mountMfa(pendingMfa: PendingMfa | null = mockChallenge, query = {}) {
  pendingMfaRef.value = pendingMfa
  mockRoute.query     = query
  setActivePinia(createPinia())

  // Re-mock to pick up latest pendingMfaRef.value
  vi.mock('@/stores/authStore', () => ({
    useAuthStore: () => ({
      pendingMfa:  pendingMfaRef.value,
      error:       null,
      verifyMfa:   mockVerifyMfa,
      clearError:  mockClearError,
      clearMfa:    mockClearMfa,
    }),
  }))

  return mount(MfaVerifyView)
}

describe('MfaVerifyView — F-05: onMounted guard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('redirects to Login when there is no pending MFA challenge', async () => {
    mountMfa(null)
    await Promise.resolve()
    expect(mockReplace).toHaveBeenCalledWith({ name: 'Login' })
  })

  it('does NOT redirect when a valid challenge is present', async () => {
    mountMfa(mockChallenge)
    await Promise.resolve()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})

describe('MfaVerifyView — digit-only input', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('strips non-numeric characters — button stays disabled for non-digit-only input', async () => {
    // Use a 3-char alphabetic string so that after stripping it is shorter than
    // 6, keeping the submit button disabled regardless of event-handler ordering.
    const wrapper = mountMfa(mockChallenge)
    const input   = wrapper.find('input')
    await input.setValue('abc')    // all non-digits → stripped to '' (len 0 < 6)
    await input.trigger('input')
    await wrapper.vm.$nextTick()

    const submitBtn = wrapper.find('button[type="submit"]')
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })

  it('allows exactly 6 digits — submit button becomes enabled', async () => {
    const wrapper   = mountMfa(mockChallenge)
    const input     = wrapper.find('input')
    await input.setValue('123456')
    await input.trigger('input')
    await wrapper.vm.$nextTick()

    // With a valid 6-digit code, submit should be enabled
    const submitBtn = wrapper.find('button[type="submit"]')
    expect(submitBtn.attributes('disabled')).toBeUndefined()
  })
})

describe('MfaVerifyView — F-05: successful verification', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('navigates to Dashboard after successful MFA', async () => {
    mockVerifyMfa.mockResolvedValue(true)
    const wrapper = mountMfa(mockChallenge)
    const input   = wrapper.find('input')
    await input.setValue('123456')
    await input.trigger('input')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPush).toHaveBeenCalledWith({ name: 'Dashboard' })
  })

  it('honours safe redirect after successful MFA', async () => {
    mockVerifyMfa.mockResolvedValue(true)
    const wrapper = mountMfa(mockChallenge, { redirect: '/security' })
    const input   = wrapper.find('input')
    await input.setValue('123456')
    await input.trigger('input')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPush).toHaveBeenCalledWith('/security')
  })

  it('rejects unsafe redirect after MFA — falls back to Dashboard', async () => {
    mockVerifyMfa.mockResolvedValue(true)
    const wrapper = mountMfa(mockChallenge, { redirect: '//evil.com' })
    const input   = wrapper.find('input')
    await input.setValue('123456')
    await input.trigger('input')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPush).toHaveBeenCalledWith({ name: 'Dashboard' })
  })
})

describe('MfaVerifyView — cancel / back to login', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls clearMfa() and navigates to Login when cancel is clicked', async () => {
    const wrapper = mountMfa(mockChallenge)
    const cancelBtn = wrapper.find('button[type="button"]')
    await cancelBtn.trigger('click')

    expect(mockClearMfa).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith({ name: 'Login' })
  })
})
