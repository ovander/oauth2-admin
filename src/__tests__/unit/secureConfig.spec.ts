/**
 * Unit tests for src/utils/secureConfig.ts
 *
 * Because ADMIN_API_URL is a module-level constant (evaluated on import),
 * every test must:
 *   1. Call vi.resetModules() to clear the module registry
 *   2. Stub import.meta.env values BEFORE doing the dynamic import
 *   3. Use dynamic import() — not a static import at the top of the file
 *
 * Security relevance (F-07):
 *  The fail-fast check prevents the app from starting in a misconfigured
 *  state where API calls could fall back to plain HTTP, exposing tokens.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('secureConfig — ADMIN_API_URL validation', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // ── Missing URL → same-origin (BFF) ─────────────────────────────────────────
  // Under the BFF model an empty value is VALID: it means same-origin, so the
  // SPA calls relative `/api/admin/*` and the BFF injects the bearer.

  it('defaults to same-origin ("") when VITE_ADMIN_API_URL is an empty string', async () => {
    vi.stubEnv('VITE_ADMIN_API_URL', '')
    const { ADMIN_API_URL } = await import('@/utils/secureConfig')
    expect(ADMIN_API_URL).toBe('')
  })

  it('defaults to same-origin ("") when VITE_ADMIN_API_URL is whitespace only', async () => {
    vi.stubEnv('VITE_ADMIN_API_URL', '   ')
    const { ADMIN_API_URL } = await import('@/utils/secureConfig')
    expect(ADMIN_API_URL).toBe('')
  })

  // ── Valid HTTPS URL ─────────────────────────────────────────────────────────

  it('exports ADMIN_API_URL with the provided HTTPS value', async () => {
    vi.stubEnv('VITE_ADMIN_API_URL', 'https://admin-api.example.com')
    const { ADMIN_API_URL } = await import('@/utils/secureConfig')
    expect(ADMIN_API_URL).toBe('https://admin-api.example.com')
  })

  it('strips a trailing slash from the URL', async () => {
    vi.stubEnv('VITE_ADMIN_API_URL', 'https://admin-api.example.com/')
    const { ADMIN_API_URL } = await import('@/utils/secureConfig')
    expect(ADMIN_API_URL).toBe('https://admin-api.example.com')
  })

  it('strips a trailing slash even with a path', async () => {
    vi.stubEnv('VITE_ADMIN_API_URL', 'https://admin-api.example.com/v1/')
    const { ADMIN_API_URL } = await import('@/utils/secureConfig')
    expect(ADMIN_API_URL).toBe('https://admin-api.example.com/v1')
  })

  // ── HTTP accepted in dev, rejected in production ────────────────────────────

  it('accepts http:// in development mode (PROD is false by default in tests)', async () => {
    vi.stubEnv('VITE_ADMIN_API_URL', 'http://localhost:3001')
    // import.meta.env.PROD defaults to false in Vitest — no throw expected
    const { ADMIN_API_URL } = await import('@/utils/secureConfig')
    expect(ADMIN_API_URL).toBe('http://localhost:3001')
  })

  it('throws when http:// is used and PROD env is truthy', async () => {
    vi.stubEnv('VITE_ADMIN_API_URL', 'http://admin-api.example.com')
    // Override PROD to simulate a production build
    vi.stubEnv('PROD', true)
    await expect(import('@/utils/secureConfig')).rejects.toThrow(
      '[CONFIG] VITE_ADMIN_API_URL must use HTTPS in production',
    )
  })

  it('does NOT throw for https:// even when PROD is truthy', async () => {
    vi.stubEnv('VITE_ADMIN_API_URL', 'https://admin-api.example.com')
    vi.stubEnv('PROD', true)
    const { ADMIN_API_URL } = await import('@/utils/secureConfig')
    expect(ADMIN_API_URL).toBe('https://admin-api.example.com')
  })
})
