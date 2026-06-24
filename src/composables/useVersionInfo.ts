import { computed } from 'vue'
import { useVersionStore } from '@/stores/version'

/**
 * Convenient read-only API for components that need to display version info.
 * clientVersion / clientBuildDate are compile-time constants (no reactivity needed).
 * Backend fields are computed refs that update once fetchBackend() resolves.
 */
export function useVersionInfo() {
  const store = useVersionStore()

  return {
    clientVersion:   APP_VERSION,
    clientBuildDate: APP_BUILD_DATE,
    backendVersion:  computed(() => store.backend?.version    ?? '…'),
    backendCommit:   computed(() => store.backend?.git_commit ?? '…'),
    backendDate:     computed(() => store.backend?.build_date ?? '…'),
    fetchError:      computed(() => store.fetchError),
  }
}
