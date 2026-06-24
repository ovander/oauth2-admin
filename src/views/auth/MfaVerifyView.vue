<template>
  <div>
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-14 h-14 bg-brand-100 dark:bg-brand-800 rounded-full mb-4">
        <i class="pi pi-lock text-2xl text-brand-600 dark:text-brand-400"></i>
      </div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        Two-Factor Authentication
      </h2>
      <p class="mt-2 text-gray-500 dark:text-brand-400">
        Enter the 6-digit code from your authenticator app
      </p>
      <p v-if="authStore.pendingMfa" class="mt-1 text-sm text-brand-600 dark:text-brand-400 font-medium">
        {{ authStore.pendingMfa.user_email }}
      </p>
    </div>

    <form @submit.prevent="handleSubmit" class="space-y-5">
      <div>
        <label for="code" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Authentication Code
        </label>
        <InputText
          id="code"
          v-model="code"
          placeholder="000000"
          class="w-full text-center text-2xl tracking-widest font-mono"
          :class="{ 'p-invalid': error }"
          maxlength="6"
          autocomplete="one-time-code"
          inputmode="numeric"
          pattern="[0-9]*"
          :disabled="isLoading"
          @input="onCodeInput"
        />
        <small v-if="error" class="text-error-600 text-xs mt-1 block">
          {{ error }}
        </small>
      </div>

      <Message v-if="authStore.error" severity="error" :closable="false" class="w-full">
        {{ authStore.error }}
      </Message>

      <Button
        type="submit"
        label="Verify"
        icon="pi pi-check"
        class="w-full btn-primary justify-center"
        :loading="isLoading"
        :disabled="code.length !== 6"
      />
    </form>

    <div class="mt-6 text-center">
      <button
        type="button"
        class="text-sm text-brand-600 dark:text-brand-400 hover:underline"
        @click="cancelMfa"
      >
        <i class="pi pi-arrow-left text-xs mr-1"></i>
        Back to login
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const route  = useRoute()
const authStore = useAuthStore()

const code      = ref('')
const error     = ref('')
const isLoading = ref(false)

// Guard: if no pending MFA challenge, redirect back to login
onMounted(() => {
  if (!authStore.pendingMfa) {
    router.replace({ name: 'Login' })
  }
})

function onCodeInput() {
  // Allow only digits
  code.value = code.value.replace(/\D/g, '').slice(0, 6)
  error.value = ''
}

async function handleSubmit() {
  if (code.value.length !== 6) {
    error.value = 'Please enter a 6-digit code'
    return
  }

  if (!authStore.pendingMfa) {
    router.replace({ name: 'Login' })
    return
  }

  authStore.clearError()
  isLoading.value = true

  const success = await authStore.verifyMfa({
    mfa_token: authStore.pendingMfa.mfa_token,
    code:      code.value,
  })

  isLoading.value = false

  if (success) {
    const redirect = route.query.redirect as string | undefined
    // Safe redirect: only allow internal relative paths (F-04)
    const safePath = redirect && /^\/[^/]/.test(redirect) ? redirect : undefined
    router.push(safePath ?? { name: 'Dashboard' })
  } else {
    code.value = ''
    error.value = authStore.error ?? 'Invalid code. Please try again.'
  }
}

function cancelMfa() {
  authStore.clearMfa()
  authStore.clearError()
  router.push({ name: 'Login' })
}
</script>
