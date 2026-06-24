<template>
  <div>
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-14 h-14 bg-amber-100 dark:bg-amber-900/40 rounded-full mb-4">
        <i class="pi pi-key text-2xl text-amber-600 dark:text-amber-400"></i>
      </div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        Update your password
      </h2>
      <p class="mt-2 text-gray-500 dark:text-brand-400">
        A password change is required before you can continue.
      </p>
    </div>

    <form @submit.prevent="handleSubmit" class="space-y-5">
      <div>
        <label for="current" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Current password
        </label>
        <Password
          id="current"
          v-model="form.current"
          placeholder="••••••••"
          toggleMask
          :feedback="false"
          class="w-full"
          inputClass="w-full"
          :disabled="isLoading"
          autocomplete="current-password"
        />
      </div>

      <div>
        <label for="next" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          New password
        </label>
        <Password
          id="next"
          v-model="form.next"
          placeholder="••••••••"
          toggleMask
          class="w-full"
          inputClass="w-full"
          :disabled="isLoading"
          autocomplete="new-password"
        />
      </div>

      <div>
        <label for="confirm" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Confirm new password
        </label>
        <Password
          id="confirm"
          v-model="form.confirm"
          placeholder="••••••••"
          toggleMask
          :feedback="false"
          class="w-full"
          inputClass="w-full"
          :disabled="isLoading"
          autocomplete="new-password"
        />
        <small v-if="mismatch" class="text-error-600 text-xs mt-1 block">
          Passwords do not match.
        </small>
      </div>

      <Message v-if="error" severity="error" :closable="false" class="w-full">
        {{ error }}
      </Message>

      <Button
        type="submit"
        label="Update password"
        icon="pi pi-check"
        class="w-full btn-primary justify-center"
        :loading="isLoading"
        :disabled="!canSubmit"
      />
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
import * as authService from '@/services/authService'
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()

const form = reactive({ current: '', next: '', confirm: '' })
const isLoading = ref(false)
const error     = ref<string | null>(null)

const mismatch  = computed(() => form.confirm.length > 0 && form.next !== form.confirm)
const canSubmit = computed(() =>
  !isLoading.value &&
  form.current.length > 0 &&
  form.next.length > 0 &&
  form.next === form.confirm,
)

function messageOf(err: unknown): string | undefined {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message
}

async function handleSubmit() {
  if (!canSubmit.value) return
  error.value = null
  isLoading.value = true
  try {
    await authService.changePassword(form.current, form.next)
    // Backend revoked all tokens — clear local state and force a fresh login.
    authStore.onPasswordChanged()
  } catch (err: unknown) {
    error.value = messageOf(err)
      ?? 'Could not update your password. Check your current password and try again.'
  } finally {
    isLoading.value = false
  }
}
</script>
