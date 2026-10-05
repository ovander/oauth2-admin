/**
 * Component tests for the application token settings: the create form sends
 * require_pkce for a confidential client (it cannot be changed later) and the
 * token settings; the detail view saves only the token settings that changed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { http, HttpResponse } from 'msw'
import { server } from '../msw/server'
import { BASE } from '../msw/handlers'
import CreateApplicationView from '@/views/applications/CreateApplicationView.vue'
import ApplicationDetailView from '@/views/applications/ApplicationDetailView.vue'

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ params: { id: '3' }, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

const slot = { template: '<div><slot /></div>' }
const stubs = {
  Tabs: slot, TabList: slot, Tab: slot, TabPanels: slot, TabPanel: slot,
  DataTable: { template: '<div />' }, Column: { template: '<span />' }, Dialog: { template: '<div />' },
  InputText: {
    template: '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'], emits: ['update:modelValue'],
  },
  Checkbox: {
    template: '<input type="checkbox" :id="inputId" v-bind="$attrs" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
    props: ['modelValue', 'binary', 'inputId'], emits: ['update:modelValue'],
  },
  InputNumber: {
    template: '<input type="number" v-bind="$attrs" :value="modelValue ?? \'\'" @input="$emit(\'update:modelValue\', $event.target.value === \'\' ? null : Number($event.target.value))" />',
    props: ['modelValue', 'min', 'max', 'useGrouping', 'inputId'], emits: ['update:modelValue'],
  },
  Select: {
    template: '<select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option></select>',
    props: ['modelValue', 'options', 'optionLabel', 'optionValue'], emits: ['update:modelValue'],
  },
}

async function setInput(w: VueWrapper, selector: string, value: string) {
  await w.find(selector).setValue(value)
}

describe('CreateApplicationView', () => {
  let body: Record<string, unknown> | null

  beforeEach(() => {
    body = null
    server.use(
      http.post(`${BASE}/api/admin/apps`, async ({ request }) => {
        body = await request.json() as Record<string, unknown>
        return HttpResponse.json({
          id: 9, name: body.name, client_id: 'cid-9', client_secret: 's3cret', active: true,
          redirect_uris: body.redirect_uris ?? [], created_at: '2026-10-05T00:00:00Z',
          is_public: !!body.is_public, require_pkce: !!body.require_pkce || !!body.is_public,
        })
      }),
      http.get(`${BASE}/api/admin/settings/config`, () => HttpResponse.json({ issuer_url: 'https://socrate.example.com' })),
    )
  })

  function mountCreate() {
    return mount(CreateApplicationView, { global: { stubs, directives: { tooltip: {} } } })
  }

  it('requires PKCE for a confidential client by default', async () => {
    const w = mountCreate()
    await setInput(w, '#name', 'Lakebridge Console')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(body).toMatchObject({ name: 'Lakebridge Console', require_pkce: true })
    expect(body).not.toHaveProperty('audiences')
    expect(body).not.toHaveProperty('claim_mappings')
  })

  it('leaves require_pkce to the server for a public client', async () => {
    const w = mountCreate()
    await setInput(w, '#name', 'SPA')
    await w.find('#is_public').setValue(true)
    expect(w.find('[data-testid="require-pkce"]').exists()).toBe(false)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(body).toMatchObject({ is_public: true })
    expect(body).not.toHaveProperty('require_pkce')
  })

  it('sends the token settings: audiences, scopes, claim mappings, lifetime', async () => {
    const w = mountCreate()
    await setInput(w, '#name', 'Lakebridge Console')
    await w.find('[data-testid="token-settings-toggle"]').trigger('click')
    await setInput(w, '[data-testid="ts-audiences"]', 'lakebridge-console')
    await setInput(w, '[data-testid="ts-scopes"]', 'openid email profile')
    await w.find('[data-testid="ts-add-claim"]').trigger('click')
    await setInput(w, '[data-testid="ts-claim-name"]', 'tenant_id')
    await setInput(w, '[data-testid="ts-claim-source"]', 'user.attributes.tenant_id')
    await setInput(w, '[data-testid="ts-ttl"]', '300')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(body).toMatchObject({
      require_pkce: true,
      audiences: ['lakebridge-console'],
      allowed_scopes: ['openid', 'email', 'profile'],
      claim_mappings: { tenant_id: 'user.attributes.tenant_id' },
      access_token_ttl_seconds: 300,
    })
  })

  it('does not send a claim mapping Socrate would refuse', async () => {
    const w = mountCreate()
    await setInput(w, '#name', 'Bad')
    await w.find('[data-testid="token-settings-toggle"]').trigger('click')
    await w.find('[data-testid="ts-add-claim"]').trigger('click')
    await setInput(w, '[data-testid="ts-claim-name"]', 'tenant_id')
    await setInput(w, '[data-testid="ts-claim-source"]', 'user.password')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(body).toBeNull()
    expect(w.find('[data-testid="ts-claim-error"]').text()).toMatch(/Unsupported source/)
  })
})

describe('ApplicationDetailView token settings', () => {
  const APP = {
    id: 3, name: 'Lakebridge Console', client_id: 'cid-lb', active: true, redirect_uris: ['https://lb.example.com/cb'],
    created_at: '2026-10-01T00:00:00Z', is_public: false, require_pkce: true,
    audiences: ['lakebridge-console'], allowed_scopes: [],
    claim_mappings: { tenant_id: 'user.attributes.tenant_id' }, access_token_ttl_seconds: 600,
  }
  let body: Record<string, unknown> | null

  async function mountDetail() {
    body = null
    server.use(
      http.get(`${BASE}/api/admin/apps/3`, () => HttpResponse.json(APP)),
      http.put(`${BASE}/api/admin/apps/3`, async ({ request }) => {
        body = await request.json() as Record<string, unknown>
        return HttpResponse.json({ ...APP, ...body, access_token_ttl_seconds: body.access_token_ttl_seconds || undefined })
      }),
      http.get(`${BASE}/api/apps/3/users`, () => HttpResponse.json({ users: [], total_count: 0, page: 1, page_size: 20 })),
      http.get(`${BASE}/api/apps/3/logs`, () => HttpResponse.json({ logs: [], total_count: 0, page: 1, page_size: 20 })),
      http.get(`${BASE}/api/admin/settings/config`, () => HttpResponse.json({ issuer_url: 'https://socrate.example.com' })),
    )
    const w = mount(ApplicationDetailView, { global: { stubs, directives: { tooltip: {} } } })
    await flushPromises()
    return w
  }

  it('shows the saved settings', async () => {
    const w = await mountDetail()
    expect((w.find('[data-testid="ts-audiences"]').element as HTMLInputElement).value).toBe('lakebridge-console')
    expect((w.find('[data-testid="ts-claim-name"]').element as HTMLInputElement).value).toBe('tenant_id')
    expect((w.find('[data-testid="ts-ttl"]').element as HTMLInputElement).value).toBe('600')
  })

  it('saves only what changed, and clears the lifetime with 0', async () => {
    const w = await mountDetail()
    await setInput(w, '[data-testid="ts-audiences"]', 'lakebridge-console lakebridge-api')
    await setInput(w, '[data-testid="ts-ttl"]', '')
    await w.find('[data-testid="token-settings-card"] form').trigger('submit')
    await flushPromises()
    expect(body).toEqual({ audiences: ['lakebridge-console', 'lakebridge-api'], access_token_ttl_seconds: 0 })
  })

  it('sends nothing when nothing changed', async () => {
    const w = await mountDetail()
    await w.find('[data-testid="token-settings-card"] form').trigger('submit')
    await flushPromises()
    expect(body).toBeNull()
  })
})
