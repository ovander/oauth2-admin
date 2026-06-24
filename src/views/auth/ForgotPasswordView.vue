<template>
  <div>
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        Reset your password
      </h2>
      <p class="mt-2 text-gray-500 dark:text-brand-400">
        Enter your email and we'll send you a reset link
      </p>
    </div>

    <form v-if="!submitted" @submit.prevent="handleSubmit" class="space-y-5">
      <!-- Email -->
      <div>
        <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Email address
        </label>
        <InputText
          id="email"
          v-model="email"
          type="email"
          placeholder="admin@example.com"
          class="w-full"
          :class="{ 'p-invalid': error }"
          :disabled="isLoading"
        />
        <small v-if="error" class="text-error-600 text-xs mt-1">
          {{ error }}
        </small>
      </div>

      <!-- Submit button -->
      <Button
        type="submit"
        label="Send reset link"
        icon="pi pi-envelope"
        class="w-full btn-primary justify-center"
        :loading="isLoading"
      />
    </form>

    <!-- Success state -->
    <div v-else class="text-center">
      <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
        <i class="pi pi-check text-2xl text-success-600 dark:text-success-400"></i>
      </div>
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Check your email
      </h3>
      <p class="text-gray-500 dark:text-brand-400 mb-6">
        We've sent a password reset link to<br />
        <span class="font-medium text-gray-700 dark:text-gray-300">{{ email }}</span>
      </p>
      <Button
        label="Resend email"
        icon="pi pi-refresh"
        class="btn-secondary"
        :loading="isLoading"
        @click="handleSubmit"
      />
    </div>

    <!-- Back to login -->
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
import { ref } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import * as authService from '@/services/authService'
const email = ref('')
const error = ref('')
const isLoading = ref(false)
const submitted = ref(false)

async function handleSubmit() {
  error.value = ''

  if (!email.value) {
    error.value = 'Email is required'
    return
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    error.value = 'Please enter a valid email'
    return
  }

  isLoading.value = true

  try {
    await authService.requestPasswordReset(email.value)
    submitted.value = true
  } catch {
    // Don't reveal if email exists or not
    submitted.value = true
  } finally {
    isLoading.value = false
  }
}
</script>
