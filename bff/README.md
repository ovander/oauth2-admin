# socrate-admin-bff

The Backend-for-Frontend (BFF) of the Socrate admin console. It is the confidential OAuth client
of the console and the only client of Socrate's admin API. It binds to loopback
(`127.0.0.1:8091` by default); Caddy serves the SPA and sends an explicit list of paths to it.

The browser holds only an opaque `__Host-` session cookie (HttpOnly, Secure, `SameSite=Strict`);
the BFF keeps the tokens in a server-side session and injects the bearer on the way upstream. An
XSS or a poisoned SPA dependency therefore cannot read a replayable admin token.

The BFF is a small Go module built on [backendkit](https://github.com/ovander/backendkit)
(`bff/go.mod` pins the version):

- `backendkit/bff` provides the session store (in memory), the session and login-binding
  cookies, PKCE and random tokens, `return_to` sanitising, the SSE-aware reverse proxy, and the
  `Gateway` that turns a session into a bearer (CSRF check, coalesced token refresh, fail-closed
  401).
- `backendkit/socrate` provides the token-set and OAuth error types shared with the gateway.

This module adds the console-specific parts: the route allowlist, the login, callback, session
and logout handlers, the step-up endpoint, token exchange and revocation, user derivation from
the access token, per-IP budgets, and configuration.

## Configuration

The BFF reads environment variables only; it does not load a file itself. Templates:
[`.env.example`](.env.example) for local development, and
[`../deploy/env/admin-bff.env.example`](../deploy/env/admin-bff.env.example) for the server,
where the file lives at `/etc/socrate/admin-bff.env`.

| Variable | Description | Default / example |
|---|---|---|
| `BFF_CLIENT_ID` | Client id of the confidential OAuth client registered in Socrate. Required (see [Pass-through mode](#pass-through-mode-migration-only)). | none; example `admin-console` |
| `BFF_CLIENT_SECRET` | Its client secret. Required when `BFF_CLIENT_ID` is set. | none |
| `BFF_LISTEN_ADDR` | Listen address. Keep it on loopback. | `127.0.0.1:8091` |
| `BFF_ADMIN_UPSTREAM` | Socrate admin API (loopback). | `http://127.0.0.1:8081` |
| `BFF_OAUTH_UPSTREAM` | Socrate issuer for back-channel calls: token, revocation, `/api/profile`, `/api/version`, password reset. | `http://127.0.0.1:8080` |
| `BFF_OAUTH_PUBLIC_URL` | Issuer origin as the browser sees it, for the `/oauth/authorize` redirect. Set it: the built-in default is a production host. | `https://socrate.example.com` |
| `BFF_PUBLIC_ORIGIN` | Public origin of the console; the redirect URI is `<origin>/bff/callback`. Set it: the built-in default is a production host. | `https://admin.example.com` |
| `BFF_SCOPES` | Scopes requested at sign-in. | `openid profile email` |
| `BFF_SESSION_IDLE` | Idle session lifetime (Go duration, must be positive). | `30m` |
| `BFF_SESSION_ABSOLUTE` | Absolute session lifetime; also the cookie `Max-Age`. | `8h` |
| `BFF_COOKIE_SECURE` | Secure cookie with the `__Host-` prefix. `false` is refused with an `https://` public origin; use it only for local development over http. | `true` |
| `BFF_LOGIN_RATE` | Per-IP budget per minute on `/bff/login`. | `10` |
| `BFF_ELEVATE_RATE` | Per-IP budget per minute on `/bff/elevate`. | `5` |
| `BFF_PASSWORD_RESET_RATE` | Per-IP budget per minute shared by the two public password-reset posts (`/api/auth/request-password-reset`, `/api/auth/reset-password`), which trigger email. | `5` |
| `BFF_CSP_REPORT_RATE` | Per-IP budget per minute on `POST /bff/csp-report`, the unauthenticated CSP report endpoint; over it, `429` without reading the body. | `30` |
| `BFF_ALLOW_PASSTHROUGH` | Migration only: forward a request without a session with its own `Authorization` header and no CSRF check. Logged as a warning. | `false` |
| `BFF_PHASE1_PASSTHROUGH` | Migration only: run with no sessions at all; see below. Logged as a warning. | `false` |

`LoadConfig` (`config.go`) refuses to start when `BFF_CLIENT_ID` is set without
`BFF_CLIENT_SECRET`, with an empty public URL or origin, with `BFF_COOKIE_SECURE=false` on an
`https://` origin, or with a non-positive session lifetime. A zero, negative or unparsable
`BFF_*_RATE` value falls back to the default, so a per-IP budget cannot be switched off.

## Routes

| Route | Auth | Upstream |
|---|---|---|
| `GET /bff/healthz` | none | none |
| `POST /bff/csp-report` | none, and no CSRF token: browsers send reports without cookies or custom headers. It only logs (see below); other methods get `405` | none |
| `GET /bff/login`, `GET /bff/callback` | login-binding cookie | issuer (back-channel token exchange) |
| `GET /bff/session` | session cookie | none (`Cache-Control: no-store`) |
| `POST /bff/logout`, `POST /bff/elevate` | session cookie + `X-CSRF-Token` | issuer (revocation) / admin API (step-up) |
| `/api/admin/*` | session cookie (+ CSRF on unsafe methods), bearer injected | admin API |
| `/api/apps/*` (app-scoped users and activity) | same | admin API |
| `/api/profile` | same | issuer |
| `GET /api/version` | none (public probe) | issuer |
| `POST /api/auth/request-password-reset`, `POST /api/auth/reset-password` | none: pre-auth flows; the browser's cookie and `Authorization` header are dropped | issuer |

Everything else is `404`. The allowlist is in `app.go`.

## Security model

- **Allowlist, never an open proxy.** Only the routes above are served, by exact path (and
  method where it matters). A request whose path is not already canonical (`..`, `.`, `//`, or
  percent-encoded dot-segments such as `%2e%2e`) is refused before matching, so the allowlist
  and the upstream always route the same string.
- **Fail closed.** No valid session means `401`. A refresh the issuer rejects deletes the
  session and clears the cookie; an unreachable token endpoint is a retryable `502`.
- **Login bound to the browser.** `/bff/login` sets a nonce cookie stored with the single-use
  `state`; `/bff/callback` completes only for the browser that presents it.
- **CSRF.** Unsafe methods on the proxy, and `/bff/logout` and `/bff/elevate`, need the
  double-submit `X-CSRF-Token` from `/bff/session`.
- **CSP reports (`cspreport.go`).** Unlike the other `/bff/*` posts, `POST /bff/csp-report` has no
  session or CSRF check, because browsers send CSP reports without either. It is safe because it
  only writes a log line: no session access, no upstream, no state change. It accepts
  `application/csp-report` (`report-uri`) and `application/reports+json` (`report-to`), `415`
  otherwise; caps the body at 8 KiB (`413`) and rejects malformed JSON (`400`); is rate-limited
  per IP (`BFF_CSP_REPORT_RATE`, `429`); and answers `204`. Each violation (at most 10 per
  request) is one `csp-report:` line with the disposition, directive, blocked URI, document URI,
  source file, line and column, and for Trusted Types the sink name. Query strings, fragments
  and userinfo are dropped from the URLs, each field is truncated to 256 bytes and stripped of
  control characters, and cookies, headers, the sample and the raw body are never logged.
  Reading them: [`docs/security-headers.md`](../docs/security-headers.md#reports).
- **Step-up.** `/bff/elevate` forwards the admin API's `4xx` challenge so the dialog can
  re-prompt, never an upstream `5xx` body, and refuses an elevated token without a usable `exp`.
- **Client IP.** Per-IP budgets use `X-Forwarded-For` only when the TCP peer is loopback (Caddy
  on the same host, which replaces any client-supplied value); otherwise the header is ignored.
  `X-Real-IP`, `True-Client-IP` and `Forwarded` are stripped before a request goes upstream.
- **Logout revokes** the refresh and access tokens at the issuer (RFC 7009) before dropping the
  session.
- **SSE-aware.** The proxies flush every write, so the security event stream is not buffered.

## Pass-through mode (migration only)

With `BFF_CLIENT_ID` unset the BFF has no sessions: it forwards `/api/admin/*` and `/api/apps/*`
to the admin API with whatever `Authorization` header the browser sends, and no CSRF check. That
mode existed only to migrate from the earlier SPA-held tokens. The BFF refuses to start in it
unless `BFF_PHASE1_PASSTHROUGH=true` is set, and logs a warning when it is. Do not use it, locally
or in production.

## Develop

```bash
go test -race ./...     # against httptest upstreams, no Socrate needed
go vet ./... && gofmt -l .
golangci-lint run ./...
```

Run it against a local Socrate, with a confidential client whose redirect URI is
`http://localhost:5173/bff/callback` (the Vite dev server forwards `/bff/*` here):

```bash
cp .env.example .env    # then set the values below
set -a && . ./.env && set +a
go run .
```

```bash
BFF_CLIENT_ID=<client id>
BFF_CLIENT_SECRET=<client secret>
BFF_OAUTH_PUBLIC_URL=http://localhost:8080
BFF_PUBLIC_ORIGIN=http://localhost:5173
BFF_COOKIE_SECURE=false
BFF_SCOPES="openid profile email"    # quoted, so the shell can source the file
```

The repository [README](../README.md#getting-started) covers the SPA side.

Container: `docker build -t socrate-admin-bff bff/` (distroless, non-root). Deployment (systemd
unit, Caddy site, build and push scripts) is in [`../deploy/`](../deploy/README.md).
