/**
 * Tests for src/stores/version.ts and src/composables/useVersionInfo.ts
 *
 * The store must read GET /api/version with the field names Socrate's
 * HealthHandler.Version writes (go-oauth2 internal/handler/health_handler.go):
 * version, commit, branch, build_time.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useVersionStore } from '@/stores/version'
import { useVersionInfo } from '@/composables/useVersionInfo'

// Exactly the server's field set, with values in the format its Makefile
// stamps: `git describe`, short SHA, branch, RFC 3339 UTC.
const SERVER_BODY = {
  version:    'v1.4.2',
  commit:     'a1b2c3d',
  branch:     'main',
  build_time: '2026-09-28T14:03:11Z',
}

function stubVersionEndpoint(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('version store', () => {
  it('parses the /api/version body with the server field names', async () => {
    const fetchMock = stubVersionEndpoint(SERVER_BODY)
    const store = useVersionStore()

    await store.fetchBackend()

    expect(fetchMock).toHaveBeenCalledWith('/api/version')
    expect(store.fetchError).toBe(false)
    expect(store.backend).toEqual(SERVER_BODY)

    const info = useVersionInfo()
    expect(info.backendVersion.value).toBe('v1.4.2')
    expect(info.backendCommit.value).toBe('a1b2c3d')
    expect(info.backendDate.value).toBe('2026-09-28T14:03:11Z')
  })

  it('flags a fetch error and leaves the placeholders when the endpoint fails', async () => {
    stubVersionEndpoint({ error: 'unavailable' }, 503)
    const store = useVersionStore()

    await store.fetchBackend()

    expect(store.fetchError).toBe(true)
    expect(store.backend).toBeNull()
    const info = useVersionInfo()
    expect(info.backendCommit.value).toBe('…')
    expect(info.backendDate.value).toBe('…')
  })
})
