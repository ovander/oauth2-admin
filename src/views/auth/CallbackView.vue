<template>
  <div class="text-center py-12">
    <!-- In-progress -->
    <div v-if="!failed">
      <i class="pi pi-spin pi-spinner text-3xl text-brand-600 dark:text-brand-400"></i>
      <h2 class="mt-5 text-xl font-semibold text-gray-900 dark:text-white">
        Completing sign-in…
      </h2>
      <p class="mt-1 text-sm text-gray-500 dark:text-brand-400">
        Verifying your authorization with Socrate.
      </p>
    </div>

    <!-- Failure -->
    <div v-else>
      <div class="inline-flex items-center justify-center w-14 h-14 bg-error-100 dark:bg-error-900/40 rounded-full mb-4">
        <i class="pi pi-times-circle text-2xl text-error-600"></i>
      </div>
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
        Sign-in failed
      </h2>
      <p class="mt-2 text-sm text-gray-500 dark:text-brand-400">
        {{ message }}
      </p>
      <Button
        label="Back to sign in"
        icon="pi pi-arrow-left"
        class="btn-primary justify-center mt-6"
        @click="goLogin"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/authStore'

const router    = useRouter()
const route     = useRoute()
const authStore = useAuthStore()

const failed  = ref(false)
const message = ref('')

/** Only allow internal relative paths to survive as a post-login target (F-04). */
function safeReturn(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  return /^\/[^/]/.test(raw) ? raw : undefined
}

function firstParam(value: unknown): string | undefined {
  if (Array.isArray(value)) return value[0] as string | undefined
  return typeof value === 'string' ? value : undefined
}

onMounted(async () => {
  const result = await authStore.handleCallback({
    code:              firstParam(route.query.code),
    state:             firstParam(route.query.state),
    error:             firstParam(route.query.error),
    error_description: firstParam(route.query.error_description),
  })

  if (result.ok) {
    const target = safeReturn(result.returnPath)
    router.replace(target ?? { name: 'Dashboard' })
    return
  }

  failed.value  = true
  message.value = authStore.error ?? 'Sign-in could not be completed. Please try again.'
})

function goLogin() {
  authStore.clearError()
  router.replace({ name: 'Login' })
}
</script>
