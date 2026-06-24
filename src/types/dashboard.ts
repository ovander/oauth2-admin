// Dashboard Statistics - matches GET /api/admin/dashboard/stats
export interface DashboardStats {
  total_users: number
  active_users: number
  total_apps: number
  active_apps: number
  today_logins: number
  today_signups: number
  failed_logins_24h: number
  locked_accounts: number
}

// Activity types
export type ActivityType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'account_locked'
  | 'password_reset'
  | 'email_verified'
  | 'token_revoked'
  | 'signup'

// Activity item - matches GET /api/admin/dashboard/activity response
export interface DashboardActivity {
  id: number
  type: ActivityType
  description: string
  user_id: number | null
  user_email: string | null
  app_id: number | null
  app_name: string | null
  ip_address: string
  success: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export interface ActivityResponse {
  activities: DashboardActivity[]
  total: number
}

// System Health - matches GET /api/admin/dashboard/health
export interface SystemHealth {
  status: 'healthy' | 'unhealthy'
  database: {
    status: 'healthy' | 'unhealthy'
    latency?: string
    error?: string
  }
  uptime: string
  version: string
  details: {
    go_version: string
    started_at: string
  }
}

// Login Trends - matches GET /api/admin/dashboard/login-trends
export interface LoginTrendItem {
  date: string
  success_count: number
  failure_count: number
  unique_users: number
}

export interface LoginTrendsResponse {
  trends: LoginTrendItem[]
  period: string
}

// App Usage - matches GET /api/admin/dashboard/app-usage
export interface AppUsageItem {
  app_id: number
  app_name: string
  client_id: string
  total_users: number
  active_users: number
  total_logins: number
  last_activity: string | null
}

export interface AppUsageResponse {
  apps: AppUsageItem[]
  total: number
}

// UI Helper types
export interface QuickAction {
  id: string
  icon: string
  label: string
  description: string
  route: string
  color: 'brand' | 'success' | 'warning' | 'error'
}

// Activity display helpers
export const activityTypeLabels: Record<ActivityType, string> = {
  login_success: 'Login Success',
  login_failed: 'Login Failed',
  logout: 'Logout',
  account_locked: 'Account Locked',
  password_reset: 'Password Reset',
  email_verified: 'Email Verified',
  token_revoked: 'Token Revoked',
  signup: 'New Signup'
}

export const activityTypeIcons: Record<ActivityType, string> = {
  login_success: 'pi-sign-in',
  login_failed: 'pi-times-circle',
  logout: 'pi-sign-out',
  account_locked: 'pi-lock',
  password_reset: 'pi-key',
  email_verified: 'pi-check-circle',
  token_revoked: 'pi-ban',
  signup: 'pi-user-plus'
}

export const activityTypeColors: Record<ActivityType, string> = {
  login_success: 'success',
  login_failed: 'error',
  logout: 'info',
  account_locked: 'warning',
  password_reset: 'info',
  email_verified: 'success',
  token_revoked: 'warning',
  signup: 'success'
}
