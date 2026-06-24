import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns'

/**
 * Format a date string or Date object to a readable format
 */
export function formatDate(date: string | Date | null | undefined, formatStr: string = 'MMM d, yyyy'): string {
  if (!date) return '-'
  
  const parsedDate = typeof date === 'string' ? parseISO(date) : date
  
  if (!isValid(parsedDate)) return '-'
  
  return format(parsedDate, formatStr)
}

/**
 * Format a date to include time
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  return formatDate(date, 'MMM d, yyyy h:mm a')
}

/**
 * Format a date to a short format
 */
export function formatDateShort(date: string | Date | null | undefined): string {
  return formatDate(date, 'MM/dd/yy')
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '-'
  
  const parsedDate = typeof date === 'string' ? parseISO(date) : date
  
  if (!isValid(parsedDate)) return '-'
  
  return formatDistanceToNow(parsedDate, { addSuffix: true })
}

/**
 * Format a date for API requests (ISO format)
 */
export function formatForApi(date: Date): string {
  return date.toISOString()
}

/**
 * Get time only from a date
 */
export function formatTime(date: string | Date | null | undefined): string {
  return formatDate(date, 'h:mm a')
}

/**
 * Format duration in seconds to human readable format
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }
  
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
  }
  
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
  }
  
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}
