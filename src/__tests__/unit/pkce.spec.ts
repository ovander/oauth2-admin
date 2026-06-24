/**
 * Unit tests for src/services/pkce.ts
 *
 * Security relevance:
 *  The PKCE verifier/challenge bind the authorization code to this browser
 *  (RFC 7636). A wrong S256 derivation would silently break the binding, so the
 *  challenge is pinned to the canonical RFC 7636 Appendix B test vector.
 */
import { describe, it, expect } from 'vitest'
import { generateCodeVerifier, deriveCodeChallenge, generateState, generateNonce } from '@/services/pkce'

describe('pkce — generateCodeVerifier()', () => {
  it('returns a URL-safe, unpadded, high-entropy string', () => {
    const v = generateCodeVerifier()
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/)        // base64url alphabet, no padding
    expect(v.length).toBeGreaterThanOrEqual(43)  // ≥ 256 bits of entropy
  })

  it('returns a different value on each call', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier())
  })
})

describe('pkce — deriveCodeChallenge() (RFC 7636 §B test vector)', () => {
  it('derives the canonical S256 challenge for the known verifier', async () => {
    const verifier  = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = await deriveCodeChallenge(verifier)
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('produces a URL-safe, unpadded challenge', async () => {
    const challenge = await deriveCodeChallenge(generateCodeVerifier())
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('pkce — state/nonce', () => {
  it('generateState() and generateNonce() are URL-safe and unguessably distinct', () => {
    expect(generateState()).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(generateState()).not.toBe(generateState())
    expect(generateNonce()).not.toBe(generateNonce())
  })
})
