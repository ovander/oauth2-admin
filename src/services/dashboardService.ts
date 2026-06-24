import api from './api'
import type {
  DashboardStats,
  ActivityResponse,
  SystemHealth,
  LoginTrendsResponse,
  AppUsageResponse
} from '@/types/dashboard'

/**
 * GET /api/admin/dashboard/stats
 * Returns overview statistics for the admin dashboard
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const response = await api.get<DashboardStats>('/api/admin/dashboard/stats')
  return response.data
}

/**
 * GET /api/admin/dashboard/activity
 * Returns recent activity items
 * @param limit - Number of items (1-100, default 10)
 */
export async function getRecentActivity(limit: number = 10): Promise<ActivityResponse> {
  const response = await api.get<ActivityResponse>('/api/admin/dashboard/activity', {
    params: { limit: Math.min(Math.max(1, limit), 100) }
  })
  return response.data
}

/**
 * GET /api/admin/dashboard/health
 * Returns system health information
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const response = await api.get<SystemHealth>('/api/admin/dashboard/health')
  return response.data
}

/**
 * GET /api/admin/dashboard/login-trends
 * Returns login trends over time
 * @param days - Number of days (1-90, default 7)
 */
export async function getLoginTrends(days: number = 7): Promise<LoginTrendsResponse> {
  const response = await api.get<LoginTrendsResponse>('/api/admin/dashboard/login-trends', {
    params: { days: Math.min(Math.max(1, days), 90) }
  })
  return response.data
}

/**
 * GET /api/admin/dashboard/app-usage
 * Returns usage statistics per OAuth app
 */
export async function getAppUsage(): Promise<AppUsageResponse> {
  const response = await api.get<AppUsageResponse>('/api/admin/dashboard/app-usage')
  return response.data
}

/**
 * Fetch all dashboard data in parallel
 * Recommended for initial page load
 */
export async function loadDashboard() {
  const [stats, activity, health, trends, appUsage] = await Promise.all([
    getDashboardStats(),
    getRecentActivity(10),
    getSystemHealth(),
    getLoginTrends(7),
    getAppUsage()
  ])

  return { stats, activity, health, trends, appUsage }
}
