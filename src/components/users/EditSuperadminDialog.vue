<template>
  <Dialog
    :visible="visible"
    modal
    header="Edit Superadmin"
    :style="{ width: '450px' }"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
        <InputText v-model="form.name" class="w-full" data-test="edit-name" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email</label>
        <InputText v-model="form.email" class="w-full" data-test="edit-email" />
      </div>
      <!-- Socrate refuses a change to your own password here (400): it goes
           through Change Password, which asks for the current one. -->
      <p v-if="self" class="text-sm text-gray-600 dark:text-gray-400" data-test="own-password-note">
        To change your own password, use
        <RouterLink :to="{ name: 'ChangePassword' }" class="text-primary-600 underline" @click="emit('update:visible', false)">
          Change Password</RouterLink>: it asks for your current one.
      </p>
      <div v-else data-test="edit-password">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">New Password</label>
        <Password v-model="form.password" toggleMask :feedback="false" class="w-full" placeholder="Leave blank to keep current" />
      </div>
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" outlined @click="emit('update:visible', false)" />
      <Button label="Save Changes" icon="pi pi-check" :loading="saving" data-test="edit-save" @click="save" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import type { Superadmin, UpdateSuperadminRequest } from '@/types/user'

const props = defineProps<{
  visible: boolean
  superadmin: Superadmin | null
  // currentUserId is the signed-in admin's id: editing that account is
  // editing oneself.
  currentUserId?: number
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  save: [update: UpdateSuperadminRequest]
}>()

const self = computed(() => props.superadmin !== null && props.currentUserId !== undefined && props.superadmin.id === props.currentUserId)

const form = reactive({ name: '', email: '', password: '' })

// Reset the form each time the dialog opens, or for another account.
watch(
  () => [props.visible, props.superadmin] as const,
  ([visible, superadmin]) => {
    if (visible && superadmin) {
      form.name = superadmin.name
      form.email = superadmin.email
      form.password = ''
    }
  },
  { immediate: true },
)

function save() {
  emit('save', {
    name: form.name || undefined,
    email: form.email || undefined,
    // Never a password for one's own account: Socrate refuses it.
    password: self.value ? undefined : form.password || undefined,
  })
}
</script>
