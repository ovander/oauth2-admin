<template>
  <div class="flex flex-col items-center justify-center py-12">
    <ProgressSpinner
      class="w-12 h-12"
      strokeWidth="4"
      animationDuration=".8s"
    />
    <p v-if="message" class="mt-4 text-gray-500 dark:text-brand-400">
      {{ message }}
    </p>
  </div>
</template>

<script setup lang="ts">
import ProgressSpinner from 'primevue/progressspinner'

defineProps<{
  message?: string
}>()
</script>
