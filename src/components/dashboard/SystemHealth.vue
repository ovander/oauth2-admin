<template>
  <div class="card p-6">
    <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4">
      System Health
    </h3>
    
    <!-- Overall Status Banner -->
    <div 
      class="flex items-center gap-3 p-3 rounded-lg mb-4"
      :class="health?.status === 'healthy' ? 'bg-success-50 dark:bg-success-900/20' : 'bg-error-50 dark:bg-error-900/20'"
    >
      <div 
        class="w-10 h-10 rounded-full flex items-center justify-center"
        :class="health?.status === 'healthy' ? 'bg-success-100 dark:bg-success-900/40' : 'bg-error-100 dark:bg-error-900/40'"
      >
        <i 
          class="pi" 
          :class="health?.status === 'healthy' ? 'pi-check-circle text-success-600' : 'pi-times-circle text-error-600'"
        ></i>
      </div>
      <div>
        <p class="font-medium text-gray-900 dark:text-white">System Status</p>
        <p 
          class="text-sm capitalize"
          :class="health?.status === 'healthy' ? 'text-success-600' : 'text-error-600'"
        >
          {{ health?.status || 'Unknown' }}
        </p>
      </div>
    </div>
    
    <!-- Service List -->
    <div class="space-y-3">
      <!-- Database -->
      <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-brand-800">
        <div class="flex items-center gap-3">
          <i class="pi pi-database text-gray-400"></i>
          <span class="text-sm text-gray-700 dark:text-gray-300">Database</span>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="health?.database?.latency" class="text-xs text-gray-500 dark:text-brand-400">
            {{ health.database.latency }}
          </span>
          <span 
            class="text-xs font-medium px-2 py-1 rounded-full"
            :class="health?.database?.status === 'healthy' 
              ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
              : 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400'"
          >
            {{ health?.database?.status === 'healthy' ? 'Healthy' : health?.database?.error || 'Unhealthy' }}
          </span>
        </div>
      </div>
      
      <!-- Version -->
      <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-brand-800">
        <div class="flex items-center gap-3">
          <i class="pi pi-tag text-gray-400"></i>
          <span class="text-sm text-gray-700 dark:text-gray-300">Version</span>
        </div>
        <span class="text-xs font-mono text-gray-600 dark:text-brand-300">
          {{ health?.version || '-' }}
        </span>
      </div>
      
      <!-- Uptime -->
      <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-brand-800">
        <div class="flex items-center gap-3">
          <i class="pi pi-clock text-gray-400"></i>
          <span class="text-sm text-gray-700 dark:text-gray-300">Uptime</span>
        </div>
        <span class="text-xs text-gray-600 dark:text-brand-300">
          {{ health?.uptime || '-' }}
        </span>
      </div>
      
      <!-- Go Version -->
      <div class="flex items-center justify-between py-2">
        <div class="flex items-center gap-3">
          <i class="pi pi-code text-gray-400"></i>
          <span class="text-sm text-gray-700 dark:text-gray-300">Go Version</span>
        </div>
        <span class="text-xs font-mono text-gray-600 dark:text-brand-300">
          {{ health?.details?.go_version || '-' }}
        </span>
      </div>
    </div>
    
    <!-- Started At -->
    <p v-if="health?.details?.started_at" class="text-xs text-gray-400 dark:text-brand-500 mt-4">
      Started {{ formatDateTime(health.details.started_at) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { SystemHealth } from '@/types/dashboard'

defineProps<{
  health: SystemHealth | null
}>()

function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString()
}
</script>
