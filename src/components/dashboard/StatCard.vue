<template>
  <div class="card p-6">
    <div class="flex items-start gap-4">
      <!-- Icon -->
      <div
        class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        :class="iconBgClass"
      >
        <i :class="['pi', icon, 'text-xl', iconColorClass]"></i>
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-500 dark:text-brand-400 mb-1">
          {{ label }}
        </p>
        <div class="flex items-baseline gap-2">
          <p class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ formattedValue }}
          </p>
          <span
            v-if="change !== undefined"
            :class="[
              'text-sm font-medium',
              change >= 0 ? 'text-success-600' : 'text-error-600'
            ]"
          >
            {{ change >= 0 ? '+' : '' }}{{ change }}%
          </span>
        </div>
        <p v-if="subtitle" class="text-xs text-gray-400 dark:text-brand-500 mt-1">
          {{ subtitle }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  icon: string
  label: string
  value: number | string
  format?: 'number' | 'percent' | 'compact'
  color?: 'brand' | 'success' | 'warning' | 'error' | 'purple' | 'blue' | 'info' | 'accent'
  subtitle?: string
  change?: number
}>()

const colorMap = {
  brand: {
    bg: 'bg-brand-100 dark:bg-brand-800',
    text: 'text-brand-600 dark:text-brand-400'
  },
  success: {
    bg: 'bg-success-100 dark:bg-success-900/30',
    text: 'text-success-600 dark:text-success-400'
  },
  warning: {
    bg: 'bg-warning-100 dark:bg-warning-900/30',
    text: 'text-warning-600 dark:text-warning-400'
  },
  error: {
    bg: 'bg-error-100 dark:bg-error-900/30',
    text: 'text-error-600 dark:text-error-400'
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-600 dark:text-purple-400'
  },
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400'
  },
  info: {
    bg: 'bg-sky-100 dark:bg-sky-900/30',
    text: 'text-sky-600 dark:text-sky-400'
  },
  accent: {
    bg: 'bg-accent-100 dark:bg-accent-900/30',
    text: 'text-accent-600 dark:text-accent-400'
  }
}

const iconBgClass = computed(() => colorMap[props.color || 'brand'].bg)
const iconColorClass = computed(() => colorMap[props.color || 'brand'].text)

const formattedValue = computed(() => {
  const val = Number(props.value)

  if (isNaN(val)) {
    return props.value
  }

  switch (props.format) {
    case 'percent':
      return `${val.toFixed(0)}%`
    case 'compact':
      if (val >= 1000000) {
        return `${(val / 1000000).toFixed(1)}M`
      }
      if (val >= 1000) {
        return `${(val / 1000).toFixed(1)}K`
      }
      return val.toLocaleString()
    default:
      return val.toLocaleString()
  }
})
</script>
