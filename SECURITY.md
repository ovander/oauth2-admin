# Security policy

The admin console is the privileged surface of the Socrate platform: a Vue SPA plus a small Go
Backend-for-Frontend (`bff/`). It is held to the same hardening bar as the server, so that it
does not become the weak link or a way into the admin API. Security reports are welcome and
handled first.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting**: the repository's **Security** tab →
**Report a vulnerability**. Do not open a public issue or pull request for a vulnerability.

Include what you found, how to reproduce it, and the version you tested (`GET /api/version`, or
the commit you built).

You will get an acknowledgement within a week. Fixes are released as soon as they are ready, and
reporters are credited in the release notes unless they prefer otherwise.

## Scope

- In scope: the admin SPA and its BFF (`bff/`), including the session and cookie model, CSRF
  protection, the proxy allowlist, step-up, and the deployment files in `deploy/`.
- Out of scope: the Socrate identity provider and its admin API (Socrate, the suite's OAuth 2.1
  / OpenID Connect server, `ovander/go-oauth2`, not public yet; it has the same maintainer, so
  report a server issue privately here and say so), the shared
  [backendkit](https://github.com/ovander/backendkit) library (report in that repository),
  denial of service by volume, and findings that need a compromised admin device.

## Supported versions

Only the latest release receives security fixes.

---

The rest of this document records the security posture: the controls enforced in code and the
deployment requirements the host must provide.

## Architecture in one paragraph

Caddy is the only public listener. It serves the built SPA from a root-owned directory and
reverse-proxies an explicit list of paths to the BFF on loopback. The BFF performs the
Authorization Code + PKCE login **server-side** as a confidential client, keeps the OAuth tokens
in a server-side session, and hands the browser only an opaque `__Host-` HttpOnly/Secure cookie.
Every admin call is a same-origin cookie request; the BFF injects the bearer and is the only
client of the loopback-only admin API. The browser never holds a token, so an XSS or a poisoned
dependency cannot exfiltrate a replayable credential. See
[docs/architecture.md](docs/architecture.md).

## Automated gates

Run before every release; all are required CI jobs:

```bash
npm run lint:check                 # ESLint security gate (see below)
npx vue-tsc -b && npm run build    # type check + production build
npm run coverage                   # Vitest unit and integration tests, coverage thresholds
npx playwright test                # end-to-end, including the security-headers check
./scripts/npm-audit-gate.sh        # dependency advisories
cd bff && go vet ./... && go test -race ./... && golangci-lint run ./...
```

- **ESLint is a security gate, not a style linter** (`eslint.config.js`). It blocks, as errors:
  `eval`/`new Function`/implied eval, `javascript:` URLs, assignment to
  `innerHTML`/`outerHTML`/`insertAdjacentHTML`, and Vue `v-html`.
- **The dependency audit fails the build** on any high or critical advisory, and also when the
  advisory service cannot be reached: a gate with no data never passes.
- **CSP is unit-tested** (`csp.spec.ts`) so the canonical policy cannot lose a hardening
  directive unnoticed; the e2e `headers.spec.ts` asserts the served app carries it.

## BFF controls (`bff/`, enforced in code)

- **Sessions are mandatory.** The BFF refuses to start without `BFF_CLIENT_ID` unless the
  migration-only pass-through (`BFF_PHASE1_PASSTHROUGH=true`) is set deliberately; that mode and
  `BFF_ALLOW_PASSTHROUGH` are logged as startup warnings. `BFF_COOKIE_SECURE=false` on an
  `https://` origin and non-positive session lifetimes are rejected.
- **Strict allowlist, never an open proxy.** `/bff/*`, `/api/admin/*`, `/api/apps/*`,
  `/api/profile`, `GET /api/version` and the two public password-reset posts; everything else is
  404. Non-canonical paths (including percent-encoded dot-segments) are refused before matching.
- **Login is bound to the browser.** `/bff/login` sets a nonce cookie stored with the pending
  state; `/bff/callback` completes only for the browser that presents it (login-CSRF and
  session-swap defence). State is single-use.
- **Fail-closed proxy.** No valid session ⇒ 401. Unsafe methods require the double-submit
  `X-CSRF-Token` (constant-time compare; an empty stored token never matches). Logout is
  state-changing and needs it too.
- **Token refresh** is coalesced across concurrent requests, detached from the caller's
  context, written through to the session store, and only a grant the issuer *rejects*
  (`invalid_grant`, `invalid_client`, …) tears the session down; a token-endpoint outage is a
  retryable 502.
- **Step-up (`/bff/elevate`)** re-authenticates the admin against the admin API and absorbs the
  short-lived elevated token into the session; the token never reaches the browser. Only the
  admin API's `4xx` challenge is forwarded to the step-up dialog; upstream `5xx` bodies are not,
  and a token without a usable `exp` is refused.
- **Upstream hygiene.** Browser cookies never reach an upstream; client-IP attribution headers
  (`X-Real-IP`, `True-Client-IP`, `Forwarded`) are stripped so the issuer only trusts
  `X-Forwarded-For` from its loopback proxies. Public pre-auth posts are forwarded without the
  session cookie or any `Authorization` header.
- **Per-IP budgets** on `/bff/login` and `/bff/elevate`. `X-Forwarded-For` is honoured only
  when the TCP peer is loopback (Caddy), which replaces any client-supplied value.
- **Logout revokes** the refresh and access tokens at the issuer (RFC 7009) before dropping the
  session and clearing the cookie.

## SPA controls (enforced in code)

- **No tokens in the browser.** `src/services/api.ts` sets no `Authorization` header and stores
  nothing in `localStorage`/`sessionStorage`; auth state is re-derived from `GET /bff/session`
  on every cold load.
- **Single same-origin API instance.** All calls (admin API, profile self-service and the
  public password-reset flows) go through the BFF on the app's own origin; there is no
  cross-origin instance.
- **401 handling.** A 401 clears the CSRF token *and* the cached user, then routes to Login, so
  a restarted BFF cannot leave the app looping.
- **Step-up and forced password change** (`src/services/adminGuards.ts`): a
  `403 elevation_required` opens the re-auth dialog and retries once; a
  `403 password_change_required` gates every route to the change-password page.
- **CSRF.** Every unsafe request carries `X-CSRF-Token` from the session bootstrap and the
  `X-Requested-By: oauth2-admin` marker.
- **Transport security:** `src/utils/secureConfig.ts` refuses a non-`https://` API origin in
  production builds.
- **Idle sign-out:** after 15 minutes without activity the console warns, then signs out.
- **No XSS sinks** (no `v-html`, `innerHTML`, `eval`, `document.write`), with the ESLint gate
  preventing regressions; **canonical, tested CSP + Trusted Types** (`src/security/csp.ts`);
  **open-redirect protection** on post-login return paths; **no source maps** in production;
  **self-hosted fonts**.

## Deployment requirements (host-provided)

See [deploy/README.md](deploy/README.md) for the Caddy site, systemd unit and scripts.

- Caddy is the only public listener; the BFF binds `127.0.0.1:8091` and the admin API stays on
  loopback. Do not set Caddy `trusted_proxies` unless a further proxy sits in front of it.
- Caddy delivers the security headers from `src/security/csp.ts`
  (`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`) plus HSTS.
  [docs/security-headers.md](docs/security-headers.md) lists them and notes where the deployed
  CSP differs from the canonical one.
- `/srv/admin/dist` is **root-owned, 0644/0755**: Caddy only reads it, and the BFF service user
  must not be able to modify the JavaScript served to admins.
- Secrets (`BFF_CLIENT_SECRET`) live only in `/etc/socrate/admin-bff.env`
  (`0640 root:socrate-admin-bff`), readable by root and the BFF's own service user only.
- The BFF runs as its own user (`socrate-admin-bff`), not as the identity server's, and its
  systemd unit hides Socrate's signing keys and env files.
- The BFF is built, tested and shipped with one Go: `toolchain go1.27.1` in `bff/go.mod` and
  `golang:1.27.1-alpine` in `bff/Dockerfile`. CI builds with the go.mod pin and fails if the
  Dockerfile's image drifts from it.
