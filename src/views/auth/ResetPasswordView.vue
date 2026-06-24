<template>
  <div>
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        Set new password
      </h2>
      <p class="mt-2 text-gray-500 dark:text-brand-400">
        Choose a strong password for your admin account (min. 16 characters)
      </p>
    </div>

    <form @submit.prevent="handleSubmit" class="space-y-5">
      <!-- New Password -->
      <div>
        <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          New password
        </label>
        <Password
          id="password"
          v-model="form.password"
          placeholder="At least 16 characters"
          toggleMask
          :feedback="true"
          class="w-full"
          inputClass="w-full"
          :class="{ 'p-invalid': errors.password }"
          :disabled="isLoading"
          autocomplete="new-password"
        />
        <small v-if="errors.password" class="text-error-600 text-xs mt-1 block">
          {{ errors.password }}
        </small>
        <!-- Strength hint -->
        <small class="text-gray-500 dark:text-brand-400 text-xs mt-1 block">
          Use a mix of uppercase, lowercase, numbers, and symbols.
        </small>
      </div>

      <!-- Confirm Password -->
      <div>
        <label for="confirmPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Confirm password
        </label>
        <Password
          id="confirmPassword"
          v-model="form.confirmPassword"
          placeholder="••••••••••••••••"
          toggleMask
          :feedback="false"
          class="w-full"
          inputClass="w-full"
          :class="{ 'p-invalid': errors.confirmPassword }"
          :disabled="isLoading"
          autocomplete="new-password"
        />
        <small v-if="errors.confirmPassword" class="text-error-600 text-xs mt-1 block">
          {{ errors.confirmPassword }}
        </small>
      </div>

      <!-- Error message -->
      <Message v-if="globalError" severity="error" :closable="false" class="w-full">
        {{ globalError }}
      </Message>

      <!-- Submit -->
      <Button
        type="submit"
        label="Reset password"
        icon="pi pi-check"
        class="w-full btn-primary justify-center"
        :loading="isLoading"
        :disabled="!resetToken"
      />
    </form>

    <div class="mt-6 text-center">
      <router-link
        :to="{ name: 'Login' }"
        class="inline-flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
      >
        <i class="pi pi-arrow-left text-xs"></i>
        Back to login
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
import * as authService from '@/services/authService'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const route  = useRoute()
const toast  = useToast()

const form = reactive({ password: '', confirmPassword: '' })
const errors = reactive({ password: '', confirmPassword: '' })
const globalError = ref('')
const isLoading   = ref(false)

/**
 * The reset token is read from the URL fragment (#token=...) rather than the
 * query string (?token=...) to prevent it appearing in server access logs,
 * browser history, and Referer headers (F-08).
 *
 * Legacy fallback: if the backend still sends ?token= links, we also read the
 * query param but immediately remove it from the URL with history.replaceState.
 */
const resetToken = ref<string | null>(null)

const MIN_PASSWORD_LENGTH = 16

function validate(): boolean {
  errors.password        = ''
  errors.confirmPassword = ''

  if (!form.password) {
    errors.password = 'Password is required'
  } else if (form.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }

  if (!form.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password'
  } else if (form.password !== form.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match'
  }

  return !errors.password && !errors.confirmPassword
}

async function handleSubmit() {
  if (!validate() || !resetToken.value) return

  globalError.value = ''
  isLoading.value   = true

  try {
    await authService.resetPassword(resetToken.value, form.password)
    // Clear the token reference so it cannot be re-submitted
    resetToken.value = null
    toast.success('Password reset successfully. Please sign in.')
    router.push({ name: 'Login' })
  } catch (err: unknown) {
    globalError.value = (err as any)?.response?.data?.message ?? 'Failed to reset password'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  // 1. Try fragment first:  /auth/reset-password#token=<value>
  const fragment = window.location.hash
  const fragMatch = fragment.match(/[#&]token=([^&]+)/)
  if (fragMatch) {
    resetToken.value = decodeURIComponent(fragMatch[1])
    // Clear the fragment from the URL so the token isn't in history
    history.replaceState(null, '', window.location.pathname + window.location.search)
    return
  }

  // 2. Legacy fallback: ?token=<value>  — read it, then remove from URL
  const queryToken = route.query.token as string | undefined
  if (queryToken) {
    resetToken.value = queryToken
    // Remove from URL immediately to minimise exposure window
    history.replaceState(null, '', window.location.pathname)
    return
  }

  globalError.value = 'Invalid or missing reset token. Please request a new link.'
})
</script>
