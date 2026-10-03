/**
 * Unit tests for src/dev/devProxy.ts — the Vite dev-server proxy table.
 *
 * Development must send the BFF exactly the paths production sends it (the
 * `@bff` matcher of deploy/Caddyfile): a path Caddy forwards but the dev proxy
 * does not falls through to index.html under `npm run dev`, and a path the dev
 * proxy sends straight to the issuer reaches it without the bearer the BFF
 * injects (a 401 that logs the user out).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { devProxy, DEV_BFF_TARGET, DEV_ISSUER_TARGET } from '@/dev/devProxy'

/** The target Vite picks for `url` (same matching rule as Vite's proxy middleware). */
function targetOf(url: string): string | undefined {
  for (const [context, opts] of Object.entries(devProxy())) {
    const matches = context.startsWith('^') ? new RegExp(context).test(url) : url.startsWith(context)
    if (matches) return opts.target
  }
  return undefined
}

/** The path patterns of the `@bff` matcher in deploy/Caddyfile. */
function caddyBffPaths(): string[] {
  const caddyfile = readFileSync(resolve(process.cwd(), 'deploy/Caddyfile'), 'utf-8')
  const line = caddyfile.split('\n').map(l => l.trim()).find(l => l.startsWith('@bff path '))
  if (!line) throw new Error('no `@bff path` matcher in deploy/Caddyfile')
  return line.slice('@bff path '.length).split(/\s+/)
}

describe('devProxy()', () => {
  const caddyPaths = caddyBffPaths()

  it('reads the production allowlist from deploy/Caddyfile', () => {
    expect(caddyPaths).toEqual(expect.arrayContaining([
      '/bff/*', '/api/admin/*', '/api/apps/*', '/api/profile', '/api/version',
      '/api/auth/request-password-reset', '/api/auth/reset-password',
    ]))
  })

  it.each(caddyPaths)('sends %s to the BFF, as Caddy does', (pattern) => {
    const path = pattern.replace(/\*$/, '1/users')
    expect(targetOf(path)).toBe(DEV_BFF_TARGET)
    expect(targetOf(`${path}?t=1`)).toBe(DEV_BFF_TARGET)
  })

  it('sends the paths the SPA calls to the BFF', () => {
    for (const url of [
      '/bff/session', '/bff/login', '/api/admin/stats', '/api/apps/7/users', '/api/apps/7/logs?page=2',
      '/api/profile', '/api/profile/mfa', '/api/profile/mfa/enroll', '/api/profile/mfa/recovery-codes',
      '/api/version', '/api/version?t=1700000000000',
      '/api/auth/request-password-reset', '/api/auth/reset-password',
    ]) {
      expect(targetOf(url), url).toBe(DEV_BFF_TARGET)
    }
  })

  it('does not forward what production does not forward', () => {
    for (const url of [
      '/', '/dashboard', '/api/auth/login', '/api/auth/token', '/api/auth', '/api/other',
      '/api/versions', '/api/profile/avatar', '/api/administrator', '/bffx',
    ]) {
      expect(targetOf(url), url).toBeUndefined()
    }
  })

  it('never sends /api/* to the issuer directly', () => {
    for (const url of ['/api/profile', '/api/auth/login', '/api/version', '/api/admin/stats']) {
      expect(targetOf(url), url).not.toBe(DEV_ISSUER_TARGET)
    }
  })

  it('keeps the OAuth endpoints on the issuer', () => {
    expect(targetOf('/oauth/authorize?client_id=x')).toBe(DEV_ISSUER_TARGET)
  })
})
