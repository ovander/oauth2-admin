/**
 * Component test for the user attributes card: it shows the saved attributes,
 * replaces the whole set on save (types kept), and does not send a set Socrate
 * would refuse.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { http, HttpResponse } from 'msw'
import { server } from '../msw/server'
import { BASE } from '../msw/handlers'
import UserAttributesCard from '@/components/users/UserAttributesCard.vue'

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

const stubs = {
  InputText: {
    template: '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'], emits: ['update:modelValue'],
  },
}

const USER = {
  id: 42, email: 'ana@example.com', name: 'Ana', role: 'user', is_verified: true, created_at: '2026-10-01T00:00:00Z',
  attributes: { seats: 12, tenant_id: 'old-tenant' },
}

function mountCard(user: Record<string, unknown> = USER) {
  let body: Record<string, unknown> | null = null
  server.use(
    http.put(`${BASE}/api/admin/users/42/attributes`, async ({ request }) => {
      body = await request.json() as Record<string, unknown>
      return HttpResponse.json({ ...USER, attributes: body.attributes })
    }),
  )
  const wrapper = mount(UserAttributesCard, { props: { user: user as never }, global: { stubs } })
  return { wrapper, sent: () => body }
}

describe('UserAttributesCard', () => {
  it('lists the attributes, non-strings as JSON', () => {
    const { wrapper } = mountCard()
    const names = wrapper.findAll('[data-testid="attr-name"]').map(i => (i.element as HTMLInputElement).value)
    const values = wrapper.findAll('[data-testid="attr-value"]').map(i => (i.element as HTMLInputElement).value)
    expect(names).toEqual(['seats', 'tenant_id'])
    expect(values).toEqual(['12', 'old-tenant'])
  })

  it('replaces the whole set, keeping types, and emits the updated user', async () => {
    const { wrapper, sent } = mountCard()
    await wrapper.findAll('[data-testid="attr-value"]')[1].setValue('0b6f3c1e-0000-4000-8000-000000000001')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(sent()).toEqual({ attributes: { seats: 12, tenant_id: '0b6f3c1e-0000-4000-8000-000000000001' } })
    const updated = wrapper.emitted('updated')?.[0]?.[0] as { attributes: Record<string, unknown> }
    expect(updated.attributes.tenant_id).toBe('0b6f3c1e-0000-4000-8000-000000000001')
  })

  it('adds an attribute to a user that has none', async () => {
    const { wrapper, sent } = mountCard({ ...USER, attributes: undefined })
    await wrapper.find('[data-testid="attr-add"]').trigger('click')
    await wrapper.find('[data-testid="attr-name"]').setValue('tenant_id')
    await wrapper.find('[data-testid="attr-value"]').setValue('t-1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(sent()).toEqual({ attributes: { tenant_id: 't-1' } })
  })

  it('does not send a duplicate name', async () => {
    const { wrapper, sent } = mountCard()
    await wrapper.find('[data-testid="attr-add"]').trigger('click')
    const names = wrapper.findAll('[data-testid="attr-name"]')
    await names[2].setValue('seats')
    await wrapper.findAll('[data-testid="attr-value"]')[2].setValue('13')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(sent()).toBeNull()
    expect(wrapper.find('[data-testid="attr-error"]').text()).toMatch(/already used/)
  })
})
