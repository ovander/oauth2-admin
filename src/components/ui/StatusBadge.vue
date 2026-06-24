<template>
  <span
    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
    :class="statusClasses"
  >
    <span
      v-if="showDot"
      class="w-1.5 h-1.5 rounded-full"
      :class="dotClass"
    ></span>
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: 'success' | 'warning' | 'error' | 'info' | 'neutral'
  label: string
  showDot?: boolean
}>()

const statusClasses = computed(() => {
  const classes: Record<string, string> = {
    success: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    warning: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
    error: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
    info: 'bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-300',
    neutral: 'bg-gray-100 text-gray-700 dark:bg-brand-800 dark:text-gray-300'
  }
  return classes[props.status] || classes.neutral
})

const dotClass = computed(() => {
  const classes: Record<string, string> = {
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    error: 'bg-error-500',
    info: 'bg-brand-500',
    neutral: 'bg-gray-500'
  }
  return classes[props.status] || classes.neutral
})
</script>
