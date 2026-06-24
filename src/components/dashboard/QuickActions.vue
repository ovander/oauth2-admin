<template>
  <div class="card p-6">
    <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4">
      Quick Actions
    </h3>
    
    <div class="space-y-2">
      <router-link
        v-for="action in actions"
        :key="action.id"
        :to="action.route"
        class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-brand-800 transition-colors group"
      >
        <div
          class="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105"
          :class="getIconBg(action.color)"
        >
          <i :class="['pi', action.icon, getIconColor(action.color)]"></i>
        </div>
        <div>
          <p class="text-sm font-medium text-gray-900 dark:text-white">
            {{ action.label }}
          </p>
          <p class="text-xs text-gray-500 dark:text-brand-400">
            {{ action.description }}
          </p>
        </div>
        <i class="pi pi-chevron-right text-gray-300 dark:text-brand-600 ml-auto group-hover:translate-x-1 transition-transform"></i>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { QuickAction } from '@/types/dashboard'

defineProps<{
  actions: QuickAction[]
}>()

function getIconBg(color: string): string {
  const classes: Record<string, string> = {
    brand: 'bg-brand-100 dark:bg-brand-800',
    success: 'bg-success-100 dark:bg-success-900/30',
    warning: 'bg-warning-100 dark:bg-warning-900/30',
    error: 'bg-error-100 dark:bg-error-900/30'
  }
  return classes[color] || classes.brand
}

function getIconColor(color: string): string {
  const classes: Record<string, string> = {
    brand: 'text-brand-600 dark:text-brand-400',
    success: 'text-success-600 dark:text-success-400',
    warning: 'text-warning-600 dark:text-warning-400',
    error: 'text-error-600 dark:text-error-400'
  }
  return classes[color] || classes.brand
}
</script>
