# ADR-0002: In-memory access token + HttpOnly refresh cookie

**Status:** Accepted

## Context

Browser SPAs must hold tokens somewhere. `localStorage`/`sessionStorage` are
readable by any script, so an XSS can exfiltrate long-lived credentials.

## Decision

- **Access token:** held in a module-level variable only (`tokenStore` in
  `services/api.ts`). Never written to web storage. Lost on reload (intentional)
  and re-minted via refresh. Sent as `Authorization: Bearer` to the admin API.
- **Refresh token:** delivered by the issuer as an **HttpOnly, `SameSite=Strict`,
  `Secure` (prod)** cookie scoped to `Path=/oauth/token`. JS can never read it.
  Rotated single-use on each refresh; replay revokes the token family.
- **Single refresh path:** `oauth.refreshAccessToken()` (`POST /oauth/token`,
  `grant_type=refresh_token`) is the only refresh route, used by both cold-start
  re-hydration and the `401` interceptor.

## Consequences

- An XSS cannot read the refresh token (HttpOnly) and the access token is short
  lived and in memory — the blast radius is bounded.
- A page reload triggers a silent refresh; if it fails, the user re-authenticates.
- The cookie is path-scoped to `/oauth/token`, so it is only ever sent to the
  issuer's token endpoint — never to the admin API.
- Over plain `http://localhost` a `Secure` cookie may be rejected; dev backends
  should issue it non-`Secure` or run HTTPS.
