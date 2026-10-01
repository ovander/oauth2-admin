import { describe, it, expect } from 'vitest'
import { buildAppEnv, normalizeIssuer, DEFAULT_ADMIN_BASE_URL } from '@/utils/appEnv'

const confidential = { id: 3, name: 'Ascenda', client_id: 'cid-123', is_public: false }

function vars(env: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of env.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    out[line.slice(0, i)] = line.slice(i + 1)
  }
  return out
}

describe('buildAppEnv', () => {
  it('renders every SOCRATE_* variable an app backend needs', () => {
    const env = buildAppEnv(confidential, { issuer: 'https://socrate.example.com/' })
    expect(vars(env)).toEqual({
      SOCRATE_ISSUER: 'https://socrate.example.com',
      SOCRATE_BASE_URL: 'https://socrate.example.com',
      SOCRATE_JWKS_URL: 'https://socrate.example.com/.well-known/jwks.json',
      SOCRATE_ADMIN_BASE_URL: DEFAULT_ADMIN_BASE_URL,
      SOCRATE_CLIENT_ID: 'cid-123',
      SOCRATE_APP_ID: '3',
    })
    expect(env).toContain('\n# SOCRATE_CLIENT_SECRET=\n')
    expect(env.endsWith('\n')).toBe(true)
  })

  it('fills the secret only when given', () => {
    const env = buildAppEnv(confidential, { issuer: 'https://socrate.example.com', clientSecret: 's3cr3t' })
    expect(vars(env).SOCRATE_CLIENT_SECRET).toBe('s3cr3t')
    expect(env).not.toContain('# SOCRATE_CLIENT_SECRET=')
    expect(buildAppEnv(confidential)).toContain('# The client secret is shown once')
  })

  it('omits the secret for a public client, even if one is passed', () => {
    const env = buildAppEnv({ ...confidential, is_public: true }, { clientSecret: 'ignored' })
    expect(vars(env)).not.toHaveProperty('SOCRATE_CLIENT_SECRET')
    expect(env).not.toContain('ignored')
    expect(env).toContain('# Public client')
  })

  it('comments the URLs out when the issuer is unknown', () => {
    const env = buildAppEnv(confidential, { issuer: 'not a url' })
    const v = vars(env)
    expect(v).not.toHaveProperty('SOCRATE_ISSUER')
    expect(v).not.toHaveProperty('SOCRATE_BASE_URL')
    expect(v).not.toHaveProperty('SOCRATE_JWKS_URL')
    expect(env).toContain('\n# SOCRATE_ISSUER=\n')
    expect(env).toContain('could not be read')
  })

  // Pasted over an existing .env, an empty NAME= would erase the working value.
  it('never writes an empty assignment', () => {
    for (const env of [
      buildAppEnv(confidential),
      buildAppEnv(confidential, { issuer: '' }),
      buildAppEnv({ ...confidential, is_public: true }),
      buildAppEnv(confidential, { issuer: 'https://socrate.example.com', clientSecret: 's' }),
    ]) {
      for (const line of env.trim().split('\n')) {
        if (!line.startsWith('#')) expect(line).toMatch(/^[A-Z_]+=.+$/)
      }
    }
  })

  it('keeps comments on their own lines and a name from adding a variable', () => {
    const env = buildAppEnv({ ...confidential, name: 'Evil\nSOCRATE_CLIENT_ID=x' })
    expect(vars(env).SOCRATE_CLIENT_ID).toBe('cid-123')
    for (const line of env.trim().split('\n')) {
      expect(line.startsWith('#') || !line.includes('#')).toBe(true)
    }
  })

  it('accepts another admin base URL', () => {
    expect(vars(buildAppEnv(confidential, { adminBaseUrl: 'http://127.0.0.1:8082' })).SOCRATE_ADMIN_BASE_URL)
      .toBe('http://127.0.0.1:8082')
  })
})

describe('normalizeIssuer', () => {
  it.each([
    ['https://socrate.example.com', 'https://socrate.example.com'],
    ['https://socrate.example.com/', 'https://socrate.example.com'],
    ['  https://socrate.example.com/idp/  ', 'https://socrate.example.com/idp'],
    ['http://localhost:8080', 'http://localhost:8080'],
    ['', ''],
    [undefined, ''],
    ['javascript:alert(1)', ''],
    ['https://socrate.example.com/?x=1', ''],
    ['https://u:p@socrate.example.com', ''],
    ['socrate.example.com', ''],
  ])('%s → %s', (raw, want) => {
    expect(normalizeIssuer(raw)).toBe(want)
  })
})
