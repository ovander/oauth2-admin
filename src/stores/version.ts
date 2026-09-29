import { defineStore } from 'pinia'

/**
 * Body of Socrate's GET /api/version (go-oauth2 HealthHandler.Version).
 * Field names are the server's JSON keys; build_time is RFC 3339 UTC.
 */
export interface BackendVersion {
  version:    string
  commit:     string
  branch:     string
  build_time: string
}

export const useVersionStore = defineStore('version', {
  state: () => ({
    backend:    null as BackendVersion | null,
    fetchError: false,
  }),

  getters: {
    // Compile-time constants injected by vite.config.ts — see env.d.ts
    clientVersion:    (): string => APP_VERSION,
    clientBuildDate:  (): string => APP_BUILD_DATE,
  },

  actions: {
    /**
     * Fetch the backend's own version from the public /api/version endpoint.
     * The endpoint requires no auth and must return Cache-Control: no-store.
     * Call fire-and-forget from main.ts — never await at bootstrap.
     */
    async fetchBackend(): Promise<void> {
      try {
        const res = await fetch('/api/version')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        this.backend    = await res.json() as BackendVersion
        this.fetchError = false
      } catch {
        this.fetchError = true
      }
    },
  },
})
