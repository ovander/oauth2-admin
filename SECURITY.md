# Security Posture — Socrate Admin Console

The admin console is the privileged surface of the Socrate OAuth2/OIDC platform.
It is a Vue SPA plus a small Go **Backend-for-Frontend** (`bff/`) and is held to
the same hardening bar as the server: it must not become the weak link or a
vector into the admin API. This document records the controls enforced in code
and the deployment requirements the host must provide. (An earlier revision
described the retired browser-held-token architecture; this one reflects the
BFF model that is actually deployed.)

## Architecture in one paragraph

Caddy is the only public listener. It serves the built SPA from a root-owned
directory and reverse-proxies an explicit list of paths to the BFF on loopback.
The BFF performs the Authorization Code + PKCE login **server-side** as a
confidential client, keeps the OAuth tokens in a server-side session, and hands
the browser only an opaque `__Host-` HttpOnly/Secure cookie. Every admin call
is a same-origin cookie request; the BFF injects the bearer and is the only
client of the loopback-only admin API. The browser never holds a token, so an
XSS or a poisoned dependency cannot exfiltrate a replayable credential.

## Automated gates

Run before every release (all are CI jobs):

```bash
npm run lint:check       # ESLint security gate (see below)
npm run build            # vue-tsc type check + production build
npm run test:run         # unit + integration tests (Vitest)
npm audit --audit-level=high
cd bff && go vet ./... && go test -race ./...
```

- **ESLint is a security gate, not a style linter** (`eslint.config.js`). It
  blocks, as errors: `eval`/`new Function`/implied-eval, `javascript:` URLs,
  assignment to `innerHTML`/`outerHTML`/`insertAdjacentHTML`, and Vue `v-html`.
- **`npm audit --audit-level=high` fails the build** on any high/critical
  advisory.
- **CSP is unit-tested** (`csp.spec.ts`) so the canonical policy cannot lose a
  hardening directive unnoticed; the e2e `headers.spec.ts` asserts the served
  app carries it.

## BFF controls (`bff/`, enforced in code)

- **Sessions are mandatory.** The BFF refuses to start without `BFF_CLIENT_ID`
  unless `BFF_PHASE1_PASSTHROUGH=true` is set deliberately; that mode and
  `BFF_ALLOW_PASSTHROUGH` are logged as startup WARNINGs. `BFF_COOKIE_SECURE=false`
  on an `https://` origin and non-positive session lifetimes are rejected.
- **Strict allowlist, never an open proxy.** `/bff/*`, `/api/admin/*`,
  `/api/profile`, `GET /api/version` and the two public password-reset posts;
  everything else is 404. Non-canonical paths (including percent-encoded
  dot-segments) are refused before matching.
- **Login is bound to the browser.** `/bff/login` sets a nonce cookie stored
  with the pending state; `/bff/callback` completes only for the browser that
  presents it (login-CSRF / session-swap defence). State is single-use.
- **Fail-closed proxy.** No valid session ⇒ 401. Unsafe methods require the
  double-submit `X-CSRF-Token` (constant-time compare; an empty stored token
  never matches). Logout is state-changing and needs it too.
- **Token refresh** is coalesced across concurrent requests, detached from the
  caller's context, written through to the session store, and only a grant the
  issuer *rejects* (`invalid_grant`, `invalid_client`, …) tears the session
  down — a token-endpoint outage is a retryable 502.
- **Step-up (`/bff/elevate`)** re-authenticates the admin against the admin
  API and absorbs the short-lived elevated token into the session; the token
  never reaches the browser. Only the admin API's `4xx` challenge is forwarded
  to the step-up dialog; upstream `5xx` bodies are not, and a token without a
  usable `exp` is refused.
- **Upstream hygiene.** Browser cookies never reach an upstream; client-IP
  attribution headers (`X-Real-IP`, `True-Client-IP`, `Forwarded`) are
  stripped so the issuer only trusts `X-Forwarded-For` from its loopback
  proxies. Public pre-auth posts are forwarded without the session cookie or
  any `Authorization` header.
- **Per-IP budgets** on `/bff/login`, `/bff/elevate` and the password-reset
  posts. `X-Forwarded-For` is honoured only when the TCP peer is loopback
  (Caddy), which replaces any client-supplied value.
- **Logout revokes** the refresh and access tokens at the issuer (RFC 7009)
  before dropping the session and clearing the cookie.

## SPA controls (enforced in code)

- **No tokens in the browser.** `src/services/api.ts` sets no `Authorization`
  header and stores nothing in `localStorage`/`sessionStorage`; auth state is
  re-derived from `GET /bff/session` on every cold load.
- **Single same-origin API instance.** All calls — admin API, profile
  self-service and the public password-reset flows — go through the BFF on the
  app's own origin; there is no cross-origin instance.
- **401 handling.** A 401 clears the CSRF token *and* the cached user, then
  routes to Login, so a restarted BFF cannot leave the app looping.
- **Step-up and forced password change** (`src/services/adminGuards.ts`): a
  `403 elevation_required` opens the re-auth dialog and retries once; a
  `403 password_change_required` gates every route to the change-password page.
- **CSRF.** Every unsafe request carries `X-CSRF-Token` from the session
  bootstrap and the `X-Requested-By: oauth2-admin` marker.
- **Transport security:** `src/utils/secureConfig.ts` refuses a non-`https://`
  API origin in production builds.
- **No XSS sinks** (no `v-html`, `innerHTML`, `eval`, `document.write`), with
  the ESLint gate preventing regressions; **canonical, tested CSP + Trusted
  Types** (`src/security/csp.ts`); **open-redirect protection** on post-login
  return paths; **no source maps** in production; **self-hosted fonts**.

## Deployment requirements (host-provided)

See `deploy/` for the Caddy site, systemd unit and scripts.

- Caddy is the only public listener; the BFF binds `127.0.0.1:8091` and the
  admin API stays on loopback. Do not set Caddy `trusted_proxies` unless a
  further proxy sits in front of it.
- Caddy delivers the security headers mirrored from `src/security/csp.ts`
  (`Content-Security-Policy`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`, HSTS).
- `/srv/admin/dist` is **root-owned, 0644/0755**: Caddy only reads it, and the
  BFF service user must not be able to modify the JavaScript served to admins.
- Secrets (`BFF_CLIENT_SECRET`) live only in `/etc/socrate/admin-bff.env`
  (`0640 root:socrate`).
- The BFF container/binary is built with the Go toolchain pinned in
  `bff/Dockerfile` (`golang:1.26`), matching `go.mod`.

## Reporting

Report suspected vulnerabilities privately to the Socrate maintainers; do not
open a public issue with exploit detail.
