/**
 * Component test for the access-policy editor view: it renders the loaded
 * state and wires the editor's controls to the composable. The flows
 * themselves are covered in usePolicyEditor.spec.ts.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { http, HttpResponse } from 'msw'
import { server } from '../msw/server'
import { BASE } from '../msw/handlers'
import PolicyView from '@/views/security/PolicyView.vue'

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: vi.fn() }) }))

const V3 = {
  version: 3, note: 'baseline', created_at: '2026-09-27T10:00:00Z', created_by: 1, mode: 'shadow',
  rules: [{ id: 'global-admins', effect: 'allow', actions: ['* /api/admin/*'] }],
}

function routes() {
  server.use(
    http.get(`${BASE}/api/admin/policy`, () => HttpResponse.json(V3)),
    http.get(`${BASE}/api/admin/policy/catalogue`, () => HttpResponse.json({
      mode: 'shadow', admin_actions: ['GET /api/admin/stats'], exempt_actions: [], attributes: [], attribute_maps: [], operators: [], obligations: [],
    })),
    http.get(`${BASE}/api/admin/policy/versions`, () => HttpResponse.json({ versions: [] })),
    http.get(`${BASE}/api/admin/policy/decisions`, () => HttpResponse.json({ decisions: [] })),
  )
}

const stubs = {
  PageHeader: { template: '<header><slot name="actions" /></header>' },
  DataTable: { template: '<div class="dt"><slot /></div>', props: ['value'] },
  Column: { template: '<span />' },
  Textarea: {
    template: '<textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'], emits: ['update:modelValue'],
  },
  ToggleSwitch: { template: '<input type="checkbox" />', props: ['modelValue'] },
  StatusBadge: { template: '<span class="badge">{{ label }}</span>', props: ['status', 'label'] },
  EmptyState: { template: '<div />' },
}

async function mountView() {
  routes()
  const wrapper = mount(PolicyView, { global: { stubs, directives: { tooltip: {} } } })
  await flushPromises()
  return wrapper
}

describe('PolicyView', () => {
  it('shows the mode and the current version', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-test="mode-card"]').text()).toContain('Shadow')
    expect(wrapper.find('[data-test="current-version"]').text()).toBe('v3')
    expect(wrapper.find('[data-test="editor"]').exists()).toBe(false)
  })

  it('opens the editor with the current rules and shows validation problems', async () => {
    const wrapper = await mountView()
    await wrapper.findAll('button').find(b => b.text().includes('Edit rules'))!.trigger('click')
    const draft = wrapper.find('[data-test="draft"]')
    expect((draft.element as HTMLTextAreaElement).value).toContain('global-admins')

    server.use(http.post(`${BASE}/api/admin/policy/validate`, () => HttpResponse.json({
      error: 'invalid_policy', errors: [{ rule: 'x', path: 'effect', message: 'must be "allow" or "deny"' }],
    }, { status: 422 })))
    await draft.setValue('[{"id":"x","effect":"maybe","actions":["*"]}]')
    await wrapper.find('[data-test="validate"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="validation-errors"]').text()).toContain('x · effect')
  })

  it('offers a reload after a conflicting save', async () => {
    const wrapper = await mountView()
    await wrapper.findAll('button').find(b => b.text().includes('Edit rules'))!.trigger('click')
    server.use(http.put(`${BASE}/api/admin/policy`, () => HttpResponse.json({ error: 'changed' }, { status: 409 })))
    await wrapper.find('[data-test="save"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="reload"]').exists()).toBe(true)
  })
})
