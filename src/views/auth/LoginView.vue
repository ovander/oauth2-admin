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
        Sign in securely with your Socrate account
      </p>
    </div>

    <!-- Error surfaced from a failed callback (?error=…) or a failed redirect start -->
    <Message v-if="authStore.error" severity="error" :closable="false" class="w-full mb-5">
      {{ authStore.error }}
    </Message>

    <Button
      type="button"
      label="Sign in with Socrate"
      icon="pi pi-sign-in"
      class="w-full btn-primary justify-center"
      :loading="isLoading"
      @click="handleSignIn"
    />

    <p class="mt-4 text-center text-xs text-gray-400 dark:text-brand-500">
      You'll be redirected to the Socrate sign-in page. Multi-factor
      authentication is handled there.
    </p>

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
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useAuthStore } from '@/stores/authStore'

const route     = useRoute()
const authStore = useAuthStore()

const isLoading = ref(false)

/** Validate redirect param — only allow internal relative paths (F-04). */
function safeRedirect(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined
  // Must start with / but NOT // (which could be protocol-relative).
  return /^\/[^/]/.test(raw) ? raw : undefined
}

async function handleSignIn() {
  authStore.clearError()
  isLoading.value = true
  try {
    const returnPath = safeRedirect(route.query.redirect as string | undefined)
    await authStore.loginRedirect(returnPath)
    // On success the browser navigates away to the AS — nothing more to do.
  } catch {
    // loginRedirect already set authStore.error; just re-enable the button.
    isLoading.value = false
  }
}

onMounted(() => {
  // Preserve a callback error (set on a redirect back to Login); only clear when
  // arriving fresh without one so a stale error doesn't linger.
  if (!route.query.error) authStore.clearError()
})
</script>
