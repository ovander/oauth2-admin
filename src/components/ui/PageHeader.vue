<template>
  <div class="mb-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <div v-if="breadcrumbs && breadcrumbs.length > 0" class="flex items-center gap-2 text-sm mb-1">
          <router-link
            v-for="(crumb, index) in breadcrumbs"
            :key="index"
            :to="crumb.to"
            class="text-gray-500 dark:text-brand-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          >
            {{ crumb.label }}
          </router-link>
          <template v-if="breadcrumbs.length > 0">
            <i class="pi pi-chevron-right text-xs text-gray-300 dark:text-brand-600"></i>
            <span class="text-gray-900 dark:text-white font-medium">{{ title }}</span>
          </template>
        </div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ title }}
        </h1>
        <p v-if="subtitle" class="mt-1 text-gray-500 dark:text-brand-400">
          {{ subtitle }}
        </p>
      </div>
      
      <div v-if="$slots.actions" class="flex items-center gap-3">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  breadcrumbs?: Array<{ label: string; to: object }>
}>()
</script>
