# ADR-0001: Authorization Code + PKCE (delegated login)

**Status:** Accepted

## Context

The console originally logged in with a first-party password flow
(`POST /api/admin/login` with email + password, plus an in-SPA MFA re-submit) —
effectively ROPC. That means the SPA handled raw credentials and held a refresh
token in JS, maximising the blast radius of any XSS and diverging from OAuth 2.1
(which removes ROPC).

## Decision

Authenticate via **Authorization Code + PKCE (S256)** as a first-party **public
client**. Login (password, MFA, consent) is delegated to the Socrate hosted page
on the issuer; the SPA only:

1. generates `code_verifier`/`state`/`nonce`, redirects to `/oauth/authorize`;
2. on callback, verifies `state` (CSRF / mix-up, RFC 6749 §10.12) and exchanges
   the code + verifier at `/oauth/token`.

## Consequences

- The SPA never sees the password or MFA code; the attack surface shrinks.
- Requires the backend to register the console as a public PKCE client
  (`ADMIN_CONSOLE_CLIENT_ID` + `ADMIN_CONSOLE_REDIRECT_URIS`).
- The hosted login is rendered by the issuer — its styling/UX is a backend
  concern, and it must be served from the issuer origin (see ADR-0003).
- Enables future phishing-resistant auth (passkeys/WebAuthn) at the hosted login
  with no SPA change.
