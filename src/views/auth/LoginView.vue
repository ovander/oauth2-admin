<template>
  <div>
    <div class="text-center mb-8">
      <div class="inline-flex items-center gap-2 px-3 py-1 bg-brand-100 dark:bg-brand-800 rounded-full mb-4">
        <i class="pi pi-shield text-brand-600 dark:text-brand-400"></i>
        <span class="text-xs font-semibold text-brand-700 dark:text-brand-300 uppercase tracking-wide">
          Superadmin Portal
        </span>
      </div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        Socrate Administration
      </h2>
      <p class="mt-2 text-gray-500 dark:text-brand-400">
        Sign in with your superadmin credentials
      </p>
    </div>

    <form @submit.prevent="handleSubmit" class="space-y-5">
      <!-- Email -->
      <div>
        <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Email address
        </label>
        <InputText
          id="email"
          v-model="form.email"
          type="email"
          placeholder="admin@example.com"
          class="w-full"
          :class="{ 'p-invalid': errors.email }"
          :disabled="isLoading"
          autocomplete="email"
        />
        <small v-if="errors.email" class="text-error-600 text-xs mt-1">
          {{ errors.email }}
        </small>
      </div>

      <!-- Password -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Password
          </label>
          <router-link
            :to="{ name: 'ForgotPassword' }"
            class="text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
          >
            Forgot password?
          </router-link>
        </div>
        <Password
          id="password"
          v-model="form.password"
          placeholder="••••••••"
          toggleMask
          :feedback="false"
          class="w-full"
          inputClass="w-full"
          :class="{ 'p-invalid': errors.password }"
          :disabled="isLoading"
          autocomplete="current-password"
        />
        <small v-if="errors.password" class="text-error-600 text-xs mt-1">
          {{ errors.password }}
        </small>
      </div>

      <!-- Error message -->
      <Message v-if="authStore.error" severity="error" :closable="false" class="w-full">
        {{ authStore.error }}
      </Message>

      <!-- Submit -->
      <Button
        type="submit"
        label="Sign in"
        icon="pi pi-sign-in"
        class="w-full btn-primary justify-center"
        :loading="isLoading"
      />
    </form>

    <div class="relative my-6">
      <div class="absolute inset-0 flex items-center">
        <div class="w-full border-t border-gray-200 dark:border-brand-700"></div>
      </div>
      <div class="relative flex justify-center text-sm">
        <span class="px-3 bg-gray-50 dark:bg-brand-950 text-gray-400 dark:text-brand-500">
          Need help?
        </span>
      </div>
    </div>

    <p class="text-center text-sm text-gray-500 dark:text-brand-400">
      Contact your system administrator for access
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useAuthStore } from '@/stores/authStore'

const router    = useRouter()
const route     = useRoute()
const authStore = useAuthStore()

const form = reactive({ email: '', password: '' })
const errors = reactive({ email: '', password: '' })
const isLoading = ref(false)

/** Validate redirect param — only allow internal relative paths (F-04) */
function safeRedirect(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined
  // Must start with / but NOT // (which could be protocol-relative)
  if (/^\/[^/]/.test(raw)) return raw
  return undefined
}

function validate(): boolean {
  errors.email    = ''
  errors.password = ''

  if (!form.email) {
    errors.email = 'Email is required'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Please enter a valid email'
  }

  if (!form.password) {
    errors.password = 'Password is required'
  }

  return !errors.email && !errors.password
}

async function handleSubmit() {
  if (!validate()) return

  authStore.clearError()
  isLoading.value = true

  const result = await authStore.login({ email: form.email, password: form.password })
  isLoading.value = false

  if (result === 'mfa_required') {
    // Preserve the intended redirect so it survives the MFA step
    const redirect = safeRedirect(route.query.redirect as string)
    router.push({ name: 'MfaVerify', query: redirect ? { redirect } : {} })
    return
  }

  if (result === 'ok') {
    const redirect = safeRedirect(route.query.redirect as string)
    router.push(redirect ?? { name: 'Dashboard' })
  }
}

onMounted(() => { authStore.clearError() })
</script>
