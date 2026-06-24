<template>
  <div>
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center gap-2 mb-2">
        <span class="px-2 py-0.5 text-xs font-semibold bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-300 rounded uppercase tracking-wide">
          Superadmin
        </span>
      </div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        Welcome back, {{ authStore.user?.name?.split(' ')[0] || 'Admin' }}
      </h1>
      <p class="mt-1 text-gray-500 dark:text-brand-400">
        OAuth2 server overview — managing all applications and global users
      </p>
    </div>

    <!-- Loading state -->
    <LoadingState v-if="loading" message="Loading dashboard..." />

    <!-- Content -->
    <template v-else>
      <!-- Stats Grid - Row 1 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 animate-stagger">
        <StatCard
          icon="pi-users"
          label="Total Users"
          :value="stats?.total_users || 0"
          color="brand"
          :subtitle="`${stats?.active_users || 0} active (30d)`"
        />
        <StatCard
          icon="pi-user-plus"
          label="Active Users"
          :value="stats?.active_users || 0"
          color="success"
          subtitle="Last 30 days"
        />
        <StatCard
          icon="pi-sign-in"
          label="Today's Logins"
          :value="stats?.today_logins || 0"
          color="info"
          :subtitle="`${stats?.today_signups || 0} new signups`"
        />
        <StatCard
          icon="pi-box"
          label="Total Apps"
          :value="stats?.total_apps || 0"
          color="accent"
          :subtitle="`${stats?.active_apps || 0} active`"
        />
      </div>

      <!-- Stats Grid - Row 2 (Security metrics) -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-stagger">
        <StatCard
          icon="pi-times-circle"
          label="Failed Logins (24h)"
          :value="stats?.failed_logins_24h || 0"
          :color="(stats?.failed_logins_24h || 0) > 10 ? 'error' : 'warning'"
          subtitle="Last 24 hours"
        />
        <StatCard
          icon="pi-lock"
          label="Locked Accounts"
          :value="stats?.locked_accounts || 0"
          :color="(stats?.locked_accounts || 0) > 0 ? 'error' : 'success'"
          subtitle="Currently locked"
        />
        <StatCard
          icon="pi-user-plus"
          label="New Signups"
          :value="stats?.today_signups || 0"
          color="success"
          subtitle="Today"
        />
      </div>

      <!-- Main Content Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <!-- Login Trends Chart (2 cols) -->
        <div class="lg:col-span-2 card p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Login Trends</h3>
              <p class="text-sm text-gray-500 dark:text-brand-400">{{ trends?.period || 'Last 7 days' }}</p>
            </div>
            <div class="flex gap-2">
              <Button
                v-for="period in [7, 14, 30]"
                :key="period"
                :label="`${period}d`"
                :outlined="trendDays !== period"
                :severity="trendDays === period ? 'primary' : 'secondary'"
                size="small"
                @click="loadTrends(period)"
              />
            </div>
          </div>
          
          <div v-if="trends?.trends?.length" class="h-64">
            <Chart type="line" :data="chartData" :options="chartOptions" class="h-full" />
          </div>
          <div v-else class="h-64 flex items-center justify-center text-gray-400 dark:text-brand-500">
            <div class="text-center">
              <i class="pi pi-chart-line text-4xl mb-2"></i>
              <p>No trend data available</p>
            </div>
          </div>
        </div>

        <!-- System Health (1 col) -->
        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Health</h3>
          
          <div class="space-y-4">
            <!-- Overall Status -->
            <div class="flex items-center justify-between p-3 rounded-lg" :class="health?.status === 'healthy' ? 'bg-success-50 dark:bg-success-900/20' : 'bg-error-50 dark:bg-error-900/20'">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center" :class="health?.status === 'healthy' ? 'bg-success-100 dark:bg-success-900/40' : 'bg-error-100 dark:bg-error-900/40'">
                  <i class="pi" :class="health?.status === 'healthy' ? 'pi-check-circle text-success-600' : 'pi-times-circle text-error-600'"></i>
                </div>
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">Overall Status</p>
                  <p class="text-sm capitalize" :class="health?.status === 'healthy' ? 'text-success-600' : 'text-error-600'">
                    {{ health?.status || 'Unknown' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Database -->
            <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-brand-800">
              <div class="flex items-center gap-3">
                <i class="pi pi-database text-gray-400"></i>
                <span class="text-gray-700 dark:text-gray-300">Database</span>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="health?.database?.latency" class="text-xs text-gray-500 dark:text-brand-400">
                  {{ health.database.latency }}
                </span>
                <span class="badge-success" v-if="health?.database?.status === 'healthy'">Healthy</span>
                <span class="badge-error" v-else>{{ health?.database?.error || 'Unhealthy' }}</span>
              </div>
            </div>

            <!-- Version -->
            <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-brand-800">
              <div class="flex items-center gap-3">
                <i class="pi pi-tag text-gray-400"></i>
                <span class="text-gray-700 dark:text-gray-300">Version</span>
              </div>
              <span class="text-sm font-mono text-gray-600 dark:text-brand-300">{{ health?.version || '-' }}</span>
            </div>

            <!-- Uptime -->
            <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-brand-800">
              <div class="flex items-center gap-3">
                <i class="pi pi-clock text-gray-400"></i>
                <span class="text-gray-700 dark:text-gray-300">Uptime</span>
              </div>
              <span class="text-sm text-gray-600 dark:text-brand-300">{{ health?.uptime || '-' }}</span>
            </div>

            <!-- Go Version -->
            <div class="flex items-center justify-between py-3">
              <div class="flex items-center gap-3">
                <i class="pi pi-code text-gray-400"></i>
                <span class="text-gray-700 dark:text-gray-300">Go Version</span>
              </div>
              <span class="text-sm font-mono text-gray-600 dark:text-brand-300">{{ health?.details?.go_version || '-' }}</span>
            </div>
          </div>

          <Button
            label="Refresh Health"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            size="small"
            class="w-full mt-4"
            @click="refreshHealth"
            :loading="healthLoading"
          />
        </div>
      </div>

      <!-- Bottom Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Recent Activity -->
        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
            <span class="text-sm text-gray-500 dark:text-brand-400">{{ activity?.total || 0 }} total events</span>
          </div>

          <div v-if="activity?.activities?.length" class="space-y-3 max-h-80 overflow-y-auto">
            <div
              v-for="item in activity.activities"
              :key="item.id"
              class="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-brand-800/50 hover:bg-gray-100 dark:hover:bg-brand-800 transition-colors"
            >
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                :class="getActivityIconBg(item.type)"
              >
                <i class="pi text-sm" :class="getActivityIcon(item.type)"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-gray-900 dark:text-white text-sm">
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
                  {{ item.user_email || 'Unknown user' }}
                  <span v-if="item.app_name" class="text-gray-400 dark:text-brand-500">
                    via {{ item.app_name }}
                  </span>
                </p>
                <div class="flex items-center gap-2 mt-1 text-xs text-gray-400 dark:text-brand-500">
                  <span>{{ formatRelativeTime(item.created_at) }}</span>
                  <span v-if="item.ip_address">• {{ item.ip_address }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="py-8 text-center text-gray-400 dark:text-brand-500">
            <i class="pi pi-inbox text-3xl mb-2"></i>
            <p>No recent activity</p>
          </div>

          <Button
            label="View All Logs"
            icon="pi pi-arrow-right"
            iconPos="right"
            severity="secondary"
            text
            size="small"
            class="w-full mt-4"
            @click="$router.push({ name: 'SecurityDashboard' })"
          />
        </div>

        <!-- App Usage -->
        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">App Usage</h3>
            <span class="text-sm text-gray-500 dark:text-brand-400">{{ appUsage?.total || 0 }} apps</span>
          </div>

          <div v-if="appUsage?.apps?.length" class="space-y-3 max-h-80 overflow-y-auto">
            <div
              v-for="app in appUsage.apps"
              :key="app.app_id"
              class="p-4 rounded-lg border border-gray-100 dark:border-brand-800 hover:border-brand-200 dark:hover:border-brand-700 transition-colors cursor-pointer"
              @click="$router.push({ name: 'ApplicationDetail', params: { id: app.app_id } })"
            >
              <div class="flex items-center justify-between mb-2">
                <h4 class="font-medium text-gray-900 dark:text-white">{{ app.app_name }}</h4>
                <span class="text-xs font-mono text-gray-400 dark:text-brand-500">{{ app.client_id.slice(0, 12) }}...</span>
              </div>
              <div class="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p class="text-lg font-semibold text-gray-900 dark:text-white">{{ app.total_users }}</p>
                  <p class="text-xs text-gray-500 dark:text-brand-400">Users</p>
                </div>
                <div>
                  <p class="text-lg font-semibold text-success-600 dark:text-success-400">{{ app.active_users }}</p>
                  <p class="text-xs text-gray-500 dark:text-brand-400">Active</p>
                </div>
                <div>
                  <p class="text-lg font-semibold text-brand-600 dark:text-brand-400">{{ formatNumber(app.total_logins) }}</p>
                  <p class="text-xs text-gray-500 dark:text-brand-400">Logins</p>
                </div>
              </div>
              <p v-if="app.last_activity" class="text-xs text-gray-400 dark:text-brand-500 mt-2">
                Last activity: {{ formatRelativeTime(app.last_activity) }}
              </p>
            </div>
          </div>
          <div v-else class="py-8 text-center text-gray-400 dark:text-brand-500">
            <i class="pi pi-box text-3xl mb-2"></i>
            <p>No apps registered</p>
          </div>

          <Button
            label="Manage Apps"
            icon="pi pi-arrow-right"
            iconPos="right"
            severity="secondary"
            text
            size="small"
            class="w-full mt-4"
            @click="$router.push({ name: 'Applications' })"
          />
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="mt-8 card p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Button
            label="New Application"
            icon="pi pi-plus"
            severity="primary"
            outlined
            class="justify-start"
            @click="$router.push({ name: 'CreateApplication' })"
          />
          <Button
            label="New User"
            icon="pi pi-user-plus"
            severity="success"
            outlined
            class="justify-start"
            @click="$router.push({ name: 'Users' })"
          />
          <Button
            label="Security Logs"
            icon="pi pi-shield"
            severity="warning"
            outlined
            class="justify-start"
            @click="$router.push({ name: 'SecurityDashboard' })"
          />
          <Button
            label="Settings"
            icon="pi pi-cog"
            severity="secondary"
            outlined
            class="justify-start"
            @click="$router.push({ name: 'Settings' })"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Button from 'primevue/button'
import Chart from 'primevue/chart'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/composables/useToast'
import LoadingState from '@/components/ui/LoadingState.vue'
import StatCard from '@/components/dashboard/StatCard.vue'
import {
  getDashboardStats,
  getRecentActivity,
  getSystemHealth,
  getLoginTrends,
  getAppUsage
} from '@/services/dashboardService'
import type {
  DashboardStats,
  ActivityResponse,
  SystemHealth,
  LoginTrendsResponse,
  AppUsageResponse,
  ActivityType
} from '@/types/dashboard'
import {
  activityTypeLabels,
  activityTypeIcons,
  activityTypeColors
} from '@/types/dashboard'

const authStore = useAuthStore()
const { showError } = useToast()

// State
const loading = ref(true)
const healthLoading = ref(false)
const stats = ref<DashboardStats | null>(null)
const activity = ref<ActivityResponse | null>(null)
const health = ref<SystemHealth | null>(null)
const trends = ref<LoginTrendsResponse | null>(null)
const appUsage = ref<AppUsageResponse | null>(null)
const trendDays = ref(7)

// Auto-refresh intervals
let statsInterval: ReturnType<typeof setInterval> | null = null
let activityInterval: ReturnType<typeof setInterval> | null = null
let healthInterval: ReturnType<typeof setInterval> | null = null

// Chart data
const chartData = computed(() => {
  if (!trends.value?.trends?.length) return { labels: [], datasets: [] }

  const labels = trends.value.trends.map(t => {
    const date = new Date(t.date)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })

  return {
    labels,
    datasets: [
      {
        label: 'Successful Logins',
        data: trends.value.trends.map(t => t.success_count),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Failed Logins',
        data: trends.value.trends.map(t => t.failure_count),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Unique Users',
        data: trends.value.trends.map(t => t.unique_users),
        borderColor: '#627d98',
        backgroundColor: 'rgba(98, 125, 152, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: {
        usePointStyle: true,
        padding: 20
      }
    }
  },
  scales: {
    x: {
      grid: {
        display: false
      }
    },
    y: {
      beginAtZero: true,
      grid: {
        color: 'rgba(0, 0, 0, 0.05)'
      }
    }
  },
  interaction: {
    intersect: false,
    mode: 'index' as const
  }
}

// Methods
async function loadDashboard() {
  loading.value = true
  try {
    const [statsRes, activityRes, healthRes, trendsRes, appUsageRes] = await Promise.all([
      getDashboardStats(),
      getRecentActivity(10),
      getSystemHealth(),
      getLoginTrends(trendDays.value),
      getAppUsage()
    ])

    stats.value = statsRes
    activity.value = activityRes
    health.value = healthRes
    trends.value = trendsRes
    appUsage.value = appUsageRes
  } catch (error) {
    showError('Failed to load dashboard data')
    console.error('Dashboard load error:', error)
  } finally {
    loading.value = false
  }
}

async function refreshStats() {
  try {
    stats.value = await getDashboardStats()
  } catch (error) {
    console.error('Stats refresh error:', error)
  }
}

async function refreshActivity() {
  try {
    activity.value = await getRecentActivity(10)
  } catch (error) {
    console.error('Activity refresh error:', error)
  }
}

async function refreshHealth() {
  healthLoading.value = true
  try {
    health.value = await getSystemHealth()
  } catch (error) {
    showError('Failed to refresh health status')
  } finally {
    healthLoading.value = false
  }
}

async function loadTrends(days: number) {
  trendDays.value = days
  try {
    trends.value = await getLoginTrends(days)
  } catch (error) {
    showError('Failed to load login trends')
  }
}

function getActivityIcon(type: ActivityType): string {
  return activityTypeIcons[type] || 'pi-info-circle'
}

function getActivityLabel(type: ActivityType): string {
  return activityTypeLabels[type] || type
}

function getActivityIconBg(type: ActivityType): string {
  const color = activityTypeColors[type] || 'info'
  const colorMap: Record<string, string> = {
    success: 'bg-success-100 dark:bg-success-900/30 text-success-600',
    error: 'bg-error-100 dark:bg-error-900/30 text-error-600',
    warning: 'bg-warning-100 dark:bg-warning-900/30 text-warning-600',
    info: 'bg-brand-100 dark:bg-brand-900/30 text-brand-600'
  }
  return colorMap[color] || colorMap.info
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

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

// Setup auto-refresh
function setupAutoRefresh() {
  // Stats: every 30 seconds
  statsInterval = setInterval(refreshStats, 30000)
  // Activity: every 10 seconds
  activityInterval = setInterval(refreshActivity, 10000)
  // Health: every 60 seconds
  healthInterval = setInterval(refreshHealth, 60000)
}

function cleanupAutoRefresh() {
  if (statsInterval) clearInterval(statsInterval)
  if (activityInterval) clearInterval(activityInterval)
  if (healthInterval) clearInterval(healthInterval)
}

// Lifecycle
onMounted(() => {
  loadDashboard()
  setupAutoRefresh()
})

onUnmounted(() => {
  cleanupAutoRefresh()
})
</script>
