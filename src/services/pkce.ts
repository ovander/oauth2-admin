/**
 * PKCE (RFC 7636) + OAuth `state`/`nonce` helpers for the Authorization Code flow.
 *
 * All randomness comes from the Web Crypto API (`crypto.getRandomValues`) and the
 * S256 challenge is derived with `crypto.subtle.digest` — no third-party deps and
 * nothing that could leak the verifier into a less-secure code path.
 */

/** 256 bits of entropy → a 43-char base64url verifier (RFC 7636 §4.1). */
const VERIFIER_BYTES = 32
/** 128 bits is plenty for an unguessable state/nonce. */
const STATE_BYTES = 16

/** Base64url-encode bytes WITHOUT padding (RFC 7636 §A). */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** A cryptographically-random URL-safe string carrying `bytes` of entropy. */
function randomUrlSafe(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return base64UrlEncode(buf)
}

/** Generate a high-entropy PKCE `code_verifier`. */
export function generateCodeVerifier(): string {
  return randomUrlSafe(VERIFIER_BYTES)
}

/** Derive the S256 `code_challenge` for a given verifier. */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(new Uint8Array(digest))
}

/** Opaque, unguessable `state` value (CSRF / mix-up protection). */
export function generateState(): string {
  return randomUrlSafe(STATE_BYTES)
}

/** Opaque, unguessable OIDC `nonce` value. */
export function generateNonce(): string {
  return randomUrlSafe(STATE_BYTES)
}
