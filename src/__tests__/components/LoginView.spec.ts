/**
 * Component tests for src/views/auth/LoginView.vue
 *
 * The login screen no longer collects credentials — it starts the
 * Authorization Code + PKCE flow by redirecting to the AS hosted login.
 *
 * Security relevance:
 *  F-03 — no password/MFA field is rendered; auth is delegated to the AS
 *  F-04 — the redirect query param is sanitised to internal relative paths
 *         before being handed to loginRedirect() (open-redirect prevention)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import LoginView from '@/views/auth/LoginView.vue'

// ─── Router mock ─────────────────────────────────────────────────────────────
const mockRoute = { query: {} as Record<string, string> }

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useRoute:  () => mockRoute,
}))

// ─── authStore mock ───────────────────────────────────────────────────────────
const mockLoginRedirect = vi.fn()
const mockClearError    = vi.fn()

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    loginRedirect: mockLoginRedirect,
    clearError:    mockClearError,
    error:         null,
    isLoading:     false,
  }),
}))

function mountLogin(queryOverrides: Record<string, string> = {}) {
  mockRoute.query = queryOverrides
  setActivePinia(createPinia())
  return mount(LoginView)
}

describe('LoginView — PKCE redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoginRedirect.mockResolvedValue(undefined)
  })

  it('renders a sign-in button and NO password field (F-03)', () => {
    const wrapper = mountLogin()
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
    expect(wrapper.find('input[type="email"]').exists()).toBe(false)
  })

  it('starts login with no return path when there is no redirect param', async () => {
    const wrapper = mountLogin()
    await wrapper.find('button').trigger('click')
    expect(mockLoginRedirect).toHaveBeenCalledWith(undefined)
  })

  it('forwards a safe relative redirect path to loginRedirect (F-04)', async () => {
    const wrapper = mountLogin({ redirect: '/apps/123' })
    await wrapper.find('button').trigger('click')
    expect(mockLoginRedirect).toHaveBeenCalledWith('/apps/123')
  })

  it('strips a protocol-relative redirect (//evil.com) — open-redirect prevention', async () => {
    const wrapper = mountLogin({ redirect: '//evil.com/steal-tokens' })
    await wrapper.find('button').trigger('click')
    expect(mockLoginRedirect).toHaveBeenCalledWith(undefined)
  })

  it('strips an https:// absolute redirect — open-redirect prevention', async () => {
    const wrapper = mountLogin({ redirect: 'https://attacker.com' })
    await wrapper.find('button').trigger('click')
    expect(mockLoginRedirect).toHaveBeenCalledWith(undefined)
  })

  it('strips a javascript: pseudo-protocol redirect', async () => {
    const wrapper = mountLogin({ redirect: 'javascript:alert(1)' })
    await wrapper.find('button').trigger('click')
    expect(mockLoginRedirect).toHaveBeenCalledWith(undefined)
  })
})
