/**
 * Component tests for src/views/auth/LoginView.vue
 *
 * Security relevance:
 *  F-04 — safeRedirect(): only internal relative paths accepted
 *  F-05 — MFA routing: login('mfa_required') must navigate to MfaVerify
 *  F-19 — No remember-me: the checkbox must not exist in the rendered DOM
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import LoginView from '@/views/auth/LoginView.vue'

// ─── Router mock ─────────────────────────────────────────────────────────────
const mockPush    = vi.fn()
const mockReplace = vi.fn()
const mockRoute   = { query: {} as Record<string, string> }

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useRoute:  () => mockRoute,
}))

// ─── authStore mock ───────────────────────────────────────────────────────────
const mockLogin      = vi.fn()
const mockClearError = vi.fn()
const mockError      = { value: null as string | null }

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    login:       mockLogin,
    clearError:  mockClearError,
    error:       mockError.value,
    isLoading:   false,
  }),
}))

function mountLogin(queryOverrides: Record<string, string> = {}) {
  mockRoute.query = queryOverrides
  setActivePinia(createPinia())
  return mount(LoginView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
}

describe('LoginView — F-04: safeRedirect()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogin.mockResolvedValue('ok')
  })

  it('redirects to /dashboard after successful login (no redirect param)', async () => {
    const wrapper = mountLogin()
    await wrapper.find('input[type="email"]').setValue('admin@example.com')
    await wrapper.find('input[type="password"]').setValue('mypassword')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPush).toHaveBeenCalledWith({ name: 'Dashboard' })
  })

  it('honours a safe relative redirect path after login', async () => {
    mockLogin.mockResolvedValue('ok')
    const wrapper = mountLogin({ redirect: '/apps/123' })
    await wrapper.find('input[type="email"]').setValue('admin@example.com')
    await wrapper.find('input[type="password"]').setValue('mypassword')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPush).toHaveBeenCalledWith('/apps/123')
  })

  it('ignores protocol-relative redirect (//evil.com) — open redirect prevention', async () => {
    mockLogin.mockResolvedValue('ok')
    const wrapper = mountLogin({ redirect: '//evil.com/steal-tokens' })
    await wrapper.find('input[type="email"]').setValue('admin@example.com')
    await wrapper.find('input[type="password"]').setValue('mypassword')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    // Must fall back to Dashboard, never navigate to //evil.com
    expect(mockPush).toHaveBeenCalledWith({ name: 'Dashboard' })
  })

  it('ignores https:// absolute redirect — open redirect prevention', async () => {
    mockLogin.mockResolvedValue('ok')
    const wrapper = mountLogin({ redirect: 'https://attacker.com' })
    await wrapper.find('input[type="email"]').setValue('admin@example.com')
    await wrapper.find('input[type="password"]').setValue('mypassword')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPush).toHaveBeenCalledWith({ name: 'Dashboard' })
  })

  it('ignores javascript: pseudo-protocol', async () => {
    mockLogin.mockResolvedValue('ok')
    const wrapper = mountLogin({ redirect: 'javascript:alert(1)' })
    await wrapper.find('input[type="email"]').setValue('admin@example.com')
    await wrapper.find('input[type="password"]').setValue('mypassword')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPush).toHaveBeenCalledWith({ name: 'Dashboard' })
  })
})

describe('LoginView — F-05: MFA routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates to MfaVerify route when login returns mfa_required', async () => {
    mockLogin.mockResolvedValue('mfa_required')
    const wrapper = mountLogin()
    await wrapper.find('input[type="email"]').setValue('admin@example.com')
    await wrapper.find('input[type="password"]').setValue('mypassword')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPush).toHaveBeenCalledWith({ name: 'MfaVerify', query: {} })
  })

  it('preserves safe redirect through MFA navigation', async () => {
    mockLogin.mockResolvedValue('mfa_required')
    const wrapper = mountLogin({ redirect: '/security' })
    await wrapper.find('input[type="email"]').setValue('admin@example.com')
    await wrapper.find('input[type="password"]').setValue('mypassword')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPush).toHaveBeenCalledWith({ name: 'MfaVerify', query: { redirect: '/security' } })
  })

  it('does NOT navigate on login error', async () => {
    mockLogin.mockResolvedValue('error')
    const wrapper = mountLogin()
    await wrapper.find('input[type="email"]').setValue('x@x.com')
    await wrapper.find('input[type="password"]').setValue('wrong')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPush).not.toHaveBeenCalled()
  })
})

describe('LoginView — F-19: No remember-me checkbox', () => {
  it('renders no remember-me checkbox in the form', () => {
    const wrapper = mountLogin()
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(0)
  })

  it('renders no element with text content matching "remember"', () => {
    const wrapper = mountLogin()
    const html = wrapper.html().toLowerCase()
    expect(html).not.toContain('remember me')
    expect(html).not.toContain('remember-me')
    expect(html).not.toContain('keep me signed in')
  })
})

describe('LoginView — form validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogin.mockResolvedValue('ok')
  })

  it('does not call authStore.login when email is empty', async () => {
    const wrapper = mountLogin()
    await wrapper.find('input[type="password"]').setValue('password')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()

    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('does not call authStore.login when password is empty', async () => {
    const wrapper = mountLogin()
    await wrapper.find('input[type="email"]').setValue('admin@example.com')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()

    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('does not call authStore.login for invalid email format', async () => {
    const wrapper = mountLogin()
    await wrapper.find('input[type="email"]').setValue('not-an-email')
    await wrapper.find('input[type="password"]').setValue('pass')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()

    expect(mockLogin).not.toHaveBeenCalled()
  })
})
