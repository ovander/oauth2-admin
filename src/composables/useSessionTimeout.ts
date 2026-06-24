import { ref, watch, onUnmounted } from 'vue'
import { useIdle } from '@vueuse/core'

/** Idle timeout in milliseconds (default 15 minutes) */
const IDLE_TIMEOUT_MS    = 15 * 60 * 1000
/** Show warning this many ms before forced logout */
const WARNING_LEAD_MS    = 2  * 60 * 1000

export function useSessionTimeout(onExpire: () => Promise<void> | void) {
  const { idle } = useIdle(IDLE_TIMEOUT_MS - WARNING_LEAD_MS)
  const showWarning = ref(false)
  const secondsLeft = ref(Math.round(WARNING_LEAD_MS / 1000))
  let countdownInterval: ReturnType<typeof setInterval> | null = null
  let expireTimer: ReturnType<typeof setTimeout> | null = null

  function clearTimers() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null }
    if (expireTimer)        { clearTimeout(expireTimer);        expireTimer        = null }
  }

  function dismissWarning() {
    showWarning.value = false
    secondsLeft.value = Math.round(WARNING_LEAD_MS / 1000)
    clearTimers()
  }

  async function expireSession() {
    clearTimers()
    showWarning.value = false
    await onExpire()
  }

  // Watch for idle state transition
  watch(idle, (isIdle) => {
    if (!isIdle) {
      // User became active again before expiry
      dismissWarning()
      return
    }

    // Show warning and begin countdown
    showWarning.value = true
    secondsLeft.value = Math.round(WARNING_LEAD_MS / 1000)

    countdownInterval = setInterval(() => {
      secondsLeft.value -= 1
    }, 1_000)

    expireTimer = setTimeout(expireSession, WARNING_LEAD_MS)
  })

  onUnmounted(clearTimers)

  return { showWarning, secondsLeft, dismissWarning }
}
