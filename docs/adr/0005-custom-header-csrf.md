# ADR-0005: Keep the `X-Requested-By` custom-header CSRF check

**Status:** Accepted

## Context

The SPA sends `X-Requested-By: oauth2-admin` on its requests. When the OAuth/admin
calls became cross-origin (ADR-0003), the backend CORS preflight rejected the
header (it wasn't in `AllowedHeaders`), blocking the token exchange. One option
was to drop the header from the SPA to quiet CORS.

## Decision

**Keep the header; allow-list it on the server.** A custom request header is a
recognised CSRF defense (OWASP "Use of Custom Request Headers"): a cross-site
page cannot set a custom header without the server granting it via CORS, so
*requiring* it means forged cross-site requests can't reach the endpoint. The
correct pairing is exactly this — the SPA sends it, and the server adds
`X-Requested-By` to its CORS `AllowedHeaders`.

## Consequences

- Defense-in-depth on top of Bearer-auth (admin API isn't cookie-ambient) and the
  `SameSite=Strict` refresh cookie.
- Every cross-origin call carries the header, so it triggers a CORS preflight —
  acceptable, and the server must keep `X-Requested-By` allow-listed.
- Removing it to reduce preflights would weaken CSRF posture — explicitly rejected.
