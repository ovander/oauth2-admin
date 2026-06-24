/**
 * Component tests for src/views/auth/ResetPasswordView.vue
 *
 * Security relevance:
 *  F-08 — Token read from URL fragment (#token=), not query string
 *  F-08 — history.replaceState() called to remove token from browser history
 *  F-21 — Minimum password length is 16 characters for admin accounts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ResetPasswordView from '@/views/auth/ResetPasswordView.vue'

// ─── Router / route mock ───────────────────────────────────────────────────────
const mockPush  = vi.fn()
const mockRoute = { query: {} as Record<string, string> }

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute:  () => mockRoute,
}))

// ─── authService mock ──────────────────────────────────────────────────────────
const mockResetPassword = vi.fn()
vi.mock('@/services/authService', () => ({
  resetPassword: (...args: unknown[]) => mockResetPassword(...args),
}))

// ─── useToast mock ─────────────────────────────────────────────────────────────
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

// ─── history.replaceState spy ─────────────────────────────────────────────────
// happy-dom implements window.history, so we can spy on replaceState directly.
let replaceStateSpy: ReturnType<typeof vi.spyOn>

// ─── Helpers ───────────────────────────────────────────────────────────────────

function mountView(hash = '', queryToken?: string) {
  mockRoute.query = queryToken ? { token: queryToken } : {}

  // Set window.location.hash — in happy-dom this is assignable
  Object.defineProperty(window, 'location', {
    value: {
      hash,
      pathname: '/auth/reset-password',
      search:   queryToken ? `?token=${queryToken}` : '',
    },
    configurable: true,
    writable:     true,
  })

  // Re-create the spy after potentially replacing window.location
  replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})

  setActivePinia(createPinia())
  return mount(ResetPasswordView)
}

describe('ResetPasswordView — F-08: token extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResetPassword.mockResolvedValue(undefined)
  })

  it('reads token from URL fragment (#token=...)', async () => {
    const wrapper = mountView('#token=fragment-reset-token-abc')
    await Promise.resolve() // let onMounted run

    // Submit button should be enabled (resetToken is set)
    const submitBtn = wrapper.find('button[type="submit"]')
    expect(submitBtn.attributes('disabled')).toBeUndefined()
  })

  it('calls history.replaceState to remove fragment from URL', async () => {
    mountView('#token=fragment-reset-token-abc')
    await Promise.resolve()

    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      '',
      expect.not.stringContaining('fragment-reset-token-abc'),
    )
  })

  it('falls back to ?token= query param if no fragment is present', async () => {
    const wrapper = mountView('', 'query-reset-token-xyz')
    await Promise.resolve()

    const submitBtn = wrapper.find('button[type="submit"]')
    expect(submitBtn.attributes('disabled')).toBeUndefined()
  })

  it('calls history.replaceState when using query-param fallback', async () => {
    mountView('', 'query-reset-token-xyz')
    await Promise.resolve()

    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      '',
      '/auth/reset-password', // search removed
    )
  })

  it('shows an error message when no token is present at all', async () => {
    const wrapper = mountView('', undefined)
    await Promise.resolve()

    expect(wrapper.text()).toContain('Invalid or missing reset token')
  })

  it('submit button is disabled when no token is found', async () => {
    const wrapper = mountView('', undefined)
    await Promise.resolve()

    const submitBtn = wrapper.find('button[type="submit"]')
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })
})

describe('ResetPasswordView — F-21: 16-character minimum password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a password shorter than 16 characters', async () => {
    const wrapper = mountView('#token=valid-token')
    await Promise.resolve()

    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0].setValue('short1234')        // 9 chars — below minimum
    await inputs[1].setValue('short1234')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()

    expect(mockResetPassword).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('16')
  })

  it('accepts a password of exactly 16 characters', async () => {
    mockResetPassword.mockResolvedValue(undefined)
    const wrapper = mountView('#token=valid-token')
    await Promise.resolve()

    const inputs   = wrapper.findAll('input[type="password"]')
    const pass16   = 'Str0ng!P@ssw0rd1'  // exactly 16 chars
    await inputs[0].setValue(pass16)
    await inputs[1].setValue(pass16)
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockResetPassword).toHaveBeenCalled()
  })

  it('rejects mismatched confirmation password', async () => {
    const wrapper = mountView('#token=valid-token')
    await Promise.resolve()

    const inputs = wrapper.findAll('input[type="password"]')
    await inputs[0].setValue('StrongPassword12!')
    await inputs[1].setValue('DifferentPassword!')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()

    expect(mockResetPassword).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('do not match')
  })

  it('sends reset token in POST body (not URL)', async () => {
    mockResetPassword.mockResolvedValue(undefined)
    const wrapper = mountView('#token=my-secret-reset-token')
    await Promise.resolve()

    const inputs = wrapper.findAll('input[type="password"]')
    const pass   = 'Str0ng!P@ssw0rd1x'
    await inputs[0].setValue(pass)
    await inputs[1].setValue(pass)
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    // Token must be the first arg to resetPassword (sent in body by authService)
    expect(mockResetPassword).toHaveBeenCalledWith('my-secret-reset-token', pass)
  })
})
