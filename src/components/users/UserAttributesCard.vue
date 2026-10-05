<template>
  <div class="card p-6" data-testid="user-attributes">
    <div class="flex items-center justify-between mb-1">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Attributes</h3>
      <span class="text-xs text-gray-500 dark:text-brand-400">{{ savedCount }} saved</span>
    </div>
    <p class="text-sm text-gray-500 dark:text-brand-400 mb-4">
      Free-form values (a tenant, a cost centre…). An attribute reaches a token only when an application maps it,
      e.g. a claim <code>tenant_id</code> with source <code>user.attributes.tenant_id</code>. Saving replaces the whole
      set; the audit log records the names, not the values.
    </p>

    <form class="space-y-2" @submit.prevent="save">
      <div v-for="(row, index) in rows" :key="index" class="space-y-1" data-testid="attr-row">
        <div class="flex flex-wrap gap-2 items-center">
          <InputText
            v-model="row.name"
            placeholder="tenant_id"
            class="w-48 font-mono"
            aria-label="Attribute name"
            :disabled="saving"
            data-testid="attr-name"
          />
          <InputText
            v-model="row.value"
            :placeholder="row.json ? 'JSON value' : 'value'"
            class="flex-1 min-w-48 font-mono"
            aria-label="Attribute value"
            :disabled="saving"
            data-testid="attr-value"
          />
          <span v-if="row.json" class="text-xs text-gray-500 dark:text-brand-400" title="Edited as JSON (number, boolean, list or object)">JSON</span>
          <Button
            icon="pi pi-trash"
            severity="danger"
            outlined
            aria-label="Remove attribute"
            :disabled="saving"
            @click="rows.splice(index, 1)"
          />
        </div>
        <small v-if="check.errors[index]" class="block text-error-600 text-xs" data-testid="attr-error">{{ check.errors[index] }}</small>
      </div>

      <div class="flex flex-wrap gap-2 pt-2">
        <Button
          label="Add attribute"
          icon="pi pi-plus"
          severity="secondary"
          outlined
          size="small"
          :disabled="saving"
          data-testid="attr-add"
          @click="rows.push({ name: '', value: '', json: false })"
        />
      </div>

      <Message v-if="message" severity="error" :closable="false" data-testid="attr-message">{{ message }}</Message>

      <div class="pt-4 border-t border-gray-100 dark:border-brand-800 flex gap-2">
        <Button type="submit" label="Save attributes" icon="pi pi-check" :loading="saving" data-testid="attr-save" />
        <Button label="Reset" severity="secondary" text :disabled="saving" @click="reset" />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { useToast } from '@/composables/useToast'
import { getErrorMessage } from '@/services/api'
import { updateUserAttributes } from '@/services/userService'
import type { GlobalUser } from '@/types/user'
import { attributesToRows, rowsToAttributes, type AttributeRow } from '@/utils/tokenSettings'

const props = defineProps<{ user: GlobalUser }>()
const emit = defineEmits<{ updated: [user: GlobalUser] }>()

const { showSuccess, showError } = useToast()

const rows = ref<AttributeRow[]>([])
const saving = ref(false)
const serverError = ref('')

const savedCount = computed(() => Object.keys(props.user.attributes ?? {}).length)
const check = computed(() => rowsToAttributes(rows.value))
const message = computed(() => serverError.value || check.value.error)

function reset() {
  rows.value = attributesToRows(props.user.attributes)
  serverError.value = ''
}

watch(() => props.user, reset, { immediate: true })

async function save() {
  serverError.value = ''
  const { attributes, errors, error } = check.value
  if (error || Object.keys(errors).length) return
  saving.value = true
  try {
    const updated = await updateUserAttributes(props.user.id, attributes)
    // The response is the user with the saved set; keep the fields it may not repeat.
    emit('updated', { ...props.user, ...updated, attributes: updated.attributes ?? {} })
    showSuccess('Attributes saved')
  } catch (e: unknown) {
    serverError.value = getErrorMessage(e) || 'Failed to save the attributes'
    showError(serverError.value)
  } finally {
    saving.value = false
  }
}
</script>
