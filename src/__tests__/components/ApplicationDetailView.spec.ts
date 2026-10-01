/**
 * Component test for the application detail view: it shows the numeric app ID
 * and copies the SOCRATE_* .env block for the application's backend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { http, HttpResponse } from 'msw'
import { server } from '../msw/server'
import { BASE } from '../msw/handlers'
import ApplicationDetailView from '@/views/applications/ApplicationDetailView.vue'

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ params: { id: '3' }, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

const APP = {
  id: 3, name: 'Ascenda', client_id: 'cid-ascenda', active: true, redirect_uris: ['https://ascenda.example.com/cb'],
  created_at: '2026-09-01T00:00:00Z', is_public: false, require_pkce: true,
}

const writeText = vi.fn<(text: string) => Promise<void>>()

function routes(issuer: string | null, app: Record<string, unknown> = APP) {
  server.use(
    http.get(`${BASE}/api/admin/apps/3`, () => HttpResponse.json(app)),
    http.get(`${BASE}/api/apps/3/users`, () => HttpResponse.json({ users: [], total_count: 0, page: 1, page_size: 20 })),
    http.get(`${BASE}/api/apps/3/logs`, () => HttpResponse.json({ logs: [], total_count: 0, page: 1, page_size: 20 })),
    http.get(`${BASE}/api/admin/settings/config`, () =>
      issuer === null
        ? HttpResponse.json({ error: 'forbidden' }, { status: 403 })
        : HttpResponse.json({ issuer_url: issuer })),
  )
}

const slot = { template: '<div><slot /></div>' }

async function mountView(issuer: string | null = 'https://socrate.example.com', app: Record<string, unknown> = APP) {
  routes(issuer, app)
  const wrapper = mount(ApplicationDetailView, {
    global: {
      stubs: {
        Tabs: slot, TabList: slot, Tab: slot, TabPanels: slot, TabPanel: slot, Select: { template: '<span />' },
        DataTable: { template: '<div />' }, Column: { template: '<span />' }, Dialog: { template: '<div />' },
        InputText: {
          template: '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          props: ['modelValue'], emits: ['update:modelValue'],
        },
      },
      directives: { tooltip: {} },
    },
  })
  await flushPromises()
  return wrapper
}

function copiedEnv(): Record<string, string> {
  const calls = writeText.mock.calls
  const text: string = calls[calls.length - 1][0]
  return Object.fromEntries(text.split('\n').filter((l: string) => l && !l.startsWith('#')).map((l: string) => {
    const i = l.indexOf('=')
    return [l.slice(0, i), l.slice(i + 1)]
  }))
}

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('ApplicationDetailView', () => {
  it('shows the numeric app ID', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="app-id"]').text()).toBe('ID 3')
  })

  it('copies the SOCRATE_* .env block, without a secret it does not have', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-test="copy-env"]').trigger('click')
    const env = copiedEnv()
    expect(env).toMatchObject({
      SOCRATE_ISSUER: 'https://socrate.example.com',
      SOCRATE_JWKS_URL: 'https://socrate.example.com/.well-known/jwks.json',
      SOCRATE_CLIENT_ID: 'cid-ascenda',
      SOCRATE_APP_ID: '3',
    })
    expect(env).not.toHaveProperty('SOCRATE_CLIENT_SECRET')
  })

  it('still copies the block when the server config is unavailable', async () => {
    const wrapper = await mountView(null)
    await wrapper.find('[data-test="copy-env"]').trigger('click')
    const env = copiedEnv()
    expect(env).not.toHaveProperty('SOCRATE_ISSUER')
    expect(env.SOCRATE_APP_ID).toBe('3')
  })

  describe('magic-link page', () => {
    const LANDING = 'https://ascenda.example.com/auth/magic'

    function capturePut(reply: (body: Record<string, unknown>) => Response) {
      const bodies: Record<string, unknown>[] = []
      server.use(http.put(`${BASE}/api/admin/apps/3`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>
        bodies.push(body)
        return reply(body)
      }))
      return bodies
    }

    it('says magic links are off when the app has no page', async () => {
      const wrapper = await mountView()
      expect((wrapper.find('[data-test="magic-link-url"]').element as HTMLInputElement).value).toBe('')
      expect(wrapper.find('[data-test="magic-link-status"]').text()).toContain('Not configured')
    })

    it('shows the configured page', async () => {
      const wrapper = await mountView(undefined, { ...APP, magic_link_url: LANDING })
      expect((wrapper.find('[data-test="magic-link-url"]').element as HTMLInputElement).value).toBe(LANDING)
      expect(wrapper.find('[data-test="magic-link-status"]').text()).not.toContain('Not configured')
    })

    it('sends the page only when it changed, and "" to clear it', async () => {
      // Like Socrate: the reply carries the stored value (absent once cleared).
      const bodies = capturePut(body => HttpResponse.json({
        ...APP, magic_link_url: 'magic_link_url' in body ? (body.magic_link_url || undefined) : LANDING,
      }))
      const wrapper = await mountView(undefined, { ...APP, magic_link_url: LANDING })

      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(bodies[0]).not.toHaveProperty('magic_link_url')

      await wrapper.find('[data-test="magic-link-url"]').setValue('')
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(bodies[1].magic_link_url).toBe('')
      expect(wrapper.find('[data-test="magic-link-status"]').text()).toContain('Not configured')
    })

    it("shows Socrate's validation error under the field", async () => {
      const msg = "invalid magic_link_url: must have the same origin as one of the app's redirect_uris"
      capturePut(() => HttpResponse.json({ error: msg }, { status: 400 }))
      const wrapper = await mountView()

      await wrapper.find('[data-test="magic-link-url"]').setValue('https://evil.example.com/magic')
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(wrapper.find('[data-test="magic-link-error"]').text()).toBe(msg)
    })
  })
})
