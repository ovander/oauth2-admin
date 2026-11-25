/**
 * The superadmin edit dialog: Socrate refuses a change to one's own password
 * on PUT /api/admin/superadmins/{id} (400, "use /api/admin/change-password"),
 * so the dialog offers no password field for one's own account and sends none.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EditSuperadminDialog from '@/components/users/EditSuperadminDialog.vue'
import type { Superadmin } from '@/types/user'

const stubs = {
  Dialog: { template: '<div v-if="visible"><slot /><slot name="footer" /></div>', props: ['visible'] },
  RouterLink: { template: '<a data-test="change-password-link"><slot /></a>', props: ['to'] },
  Password: {
    template: '<input data-test="password-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'], emits: ['update:modelValue'],
  },
}

const admin = (id: number): Superadmin => ({ id, email: `admin${id}@example.test`, name: `Admin ${id}`, is_verified: true, failed_logins: 0 } as Superadmin)

function mountDialog(superadmin: Superadmin, currentUserId: number) {
  return mount(EditSuperadminDialog, {
    props: { visible: true, superadmin, currentUserId },
    global: { stubs },
  })
}

describe('EditSuperadminDialog', () => {
  it('offers a new password for another superadmin, and sends it', async () => {
    const wrapper = mountDialog(admin(2), 1)
    expect(wrapper.find('[data-test="own-password-note"]').exists()).toBe(false)
    await wrapper.find('[data-test="password-input"]').setValue('N3w-passw0rd!')
    await wrapper.find('[data-test="edit-save"]').trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual({ name: 'Admin 2', email: 'admin2@example.test', password: 'N3w-passw0rd!' })
  })

  it('sends no password when it is left blank', async () => {
    const wrapper = mountDialog(admin(2), 1)
    await wrapper.find('[data-test="edit-save"]').trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual({ name: 'Admin 2', email: 'admin2@example.test', password: undefined })
  })

  it('points to Change Password for one\'s own account, and sends no password', async () => {
    const wrapper = mountDialog(admin(1), 1)
    expect(wrapper.find('[data-test="edit-password"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="password-input"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="own-password-note"]').text()).toContain('Change Password')
    expect(wrapper.find('[data-test="change-password-link"]').exists()).toBe(true)
    await wrapper.find('[data-test="edit-name"]').setValue('Renamed')
    await wrapper.find('[data-test="edit-save"]').trigger('click')
    const update = wrapper.emitted('save')?.[0]?.[0] as Record<string, unknown>
    expect(update.name).toBe('Renamed')
    expect(update.password).toBeUndefined()
  })

  it('fills the form again for each account it opens', async () => {
    const wrapper = mountDialog(admin(2), 1)
    await wrapper.find('[data-test="password-input"]').setValue('typed-then-abandoned')
    await wrapper.setProps({ superadmin: admin(3) })
    await wrapper.find('[data-test="edit-save"]').trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual({ name: 'Admin 3', email: 'admin3@example.test', password: undefined })
  })
})
