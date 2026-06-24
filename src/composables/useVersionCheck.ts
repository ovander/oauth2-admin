import { onMounted, onUnmounted } from 'vue'
import { useVersionStore } from '@/stores/version'
import { useToast } from '@/composables/useToast'

/**
 * Background polling for stale-tab detection.
 *
 * On mount, captures the backend version that was live when the tab opened
 * (snapshot). Every `intervalMs` ms it re-fetches /api/version. If the
 * version string has changed, a sticky info toast is shown inviting the user
 * to reload. The user is never force-reloaded — they retain agency.
 *
 * Mount once in AdminLayout.vue. The interval is self-cleaned on unmount.
 *
 * @param intervalMs  Poll interval — default 5 minutes.
 */
export function useVersionCheck(intervalMs = 5 * 60 * 1000) {
  const store = useVersionStore()
  const toast = useToast()

  // Snapshot of the backend version that was live when this tab opened.
  // Initialised from the store (already fetched fire-and-forget at bootstrap).
  let snapshot: string | null = null

  store.fetchBackend().then(() => {
    snapshot = store.backend?.version ?? null
  })

  async function check() {
    try {
      // Cache-bust so browsers never serve a stale /api/version response
      const res = await fetch(`/api/version?t=${Date.now()}`)
      if (!res.ok) return
      const data = await res.json() as { version: string }

      if (snapshot && data.version !== snapshot) {
        // Update snapshot so the toast fires once per new version, not every poll
        snapshot = data.version
        // Reflect the new backend version in the store so VersionBadge updates
        if (store.backend) store.backend.version = data.version

        // life: 0 = sticky — useToast.add is the raw PrimeVue .add() method
        toast.add({
          severity: 'info',
          summary:  'Update Available',
          detail:   'A new version has been deployed. Refresh the page to get the latest.',
          life:     0,
        })
      }
    } catch {
      // Offline or backend unreachable — silently ignore
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(()   => { timer = setInterval(check, intervalMs) })
  onUnmounted(() => { if (timer !== null) clearInterval(timer) })
}
