<template>
  <div class="card">
    <div class="px-6 py-4 border-b border-gray-100 dark:border-brand-800 flex items-center justify-between">
      <h3 class="text-base font-semibold text-gray-900 dark:text-white">
        {{ title }}
      </h3>
      <span v-if="total" class="text-xs text-gray-500 dark:text-brand-400">
        {{ total }} total
      </span>
    </div>
    
    <div class="divide-y divide-gray-100 dark:divide-brand-800 max-h-96 overflow-y-auto">
      <div
        v-for="item in items"
        :key="item.id"
        class="px-6 py-4 hover:bg-gray-50 dark:hover:bg-brand-800/50 transition-colors"
      >
        <div class="flex items-start gap-3">
          <!-- Icon -->
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
            :class="getIconBg(item.type)"
          >
            <i :class="['pi text-sm', getIcon(item.type)]"></i>
          </div>
          
          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-900 dark:text-white">
                {{ getActivityLabel(item.type) }}
              </span>
              <span 
                v-if="!item.success && item.type !== 'login_failed'" 
                class="px-1.5 py-0.5 text-xs bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-400 rounded"
              >
                Failed
              </span>
            </div>
            <p class="text-sm text-gray-600 dark:text-brand-300 truncate">
              {{ item.description }}
            </p>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <span v-if="item.user_email" class="text-xs text-gray-500 dark:text-brand-400">
                {{ item.user_email }}
              </span>
              <span v-if="item.app_name" class="text-xs text-gray-400 dark:text-brand-500">
                via {{ item.app_name }}
              </span>
              <span class="text-xs text-gray-400 dark:text-brand-500">
                • {{ formatRelativeTime(item.created_at) }}
              </span>
              <span v-if="item.ip_address" class="text-xs text-gray-400 dark:text-brand-500">
                • {{ item.ip_address }}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Empty state -->
      <div v-if="items.length === 0" class="px-6 py-12 text-center">
        <i class="pi pi-inbox text-4xl text-gray-300 dark:text-brand-700 mb-3"></i>
        <p class="text-sm text-gray-500 dark:text-brand-400">No recent activity</p>
      </div>
    </div>
    
    <!-- View all link -->
    <div v-if="showViewAll && viewAllRoute && items.length > 0" class="px-6 py-3 border-t border-gray-100 dark:border-brand-800">
      <router-link
        :to="viewAllRoute"
        class="text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
      >
        View all activity →
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { DashboardActivity, ActivityType } from '@/types/dashboard'
import { activityTypeLabels, activityTypeIcons, activityTypeColors } from '@/types/dashboard'

defineProps<{
  title: string
  items: DashboardActivity[]
  total?: number
  showViewAll?: boolean
  viewAllRoute?: RouteLocationRaw
}>()

function getIcon(type: ActivityType): string {
  return activityTypeIcons[type] || 'pi-info-circle'
}

function getActivityLabel(type: ActivityType): string {
  return activityTypeLabels[type] || type
}

function getIconBg(type: ActivityType): string {
  const color = activityTypeColors[type] || 'info'
  const bgMap: Record<string, string> = {
    success: 'bg-success-100 dark:bg-success-900/30 text-success-600 dark:text-success-400',
    error: 'bg-error-100 dark:bg-error-900/30 text-error-600 dark:text-error-400',
    warning: 'bg-warning-100 dark:bg-warning-900/30 text-warning-600 dark:text-warning-400',
    info: 'bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-400'
  }
  return bgMap[color] || bgMap.info
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
</script>
