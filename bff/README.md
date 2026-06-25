# socrate-admin-bff

A small, **stdlib-only** Go Backend-for-Frontend (BFF) for the Socrate admin
console. It is the **only client of the admin API** for this console and binds
**loopback only** (`127.0.0.1:8091`). Caddy serves the SPA static files and
routes `/bff/*` and `/api/admin/*` to this service.

The goal is to remove OAuth tokens from the browser entirely: the browser holds
only an opaque `__Host-` HttpOnly/Secure/SameSite=Strict session cookie, and the
BFF injects the bearer token server-side. This bounds the blast radius of an XSS
or a poisoned SPA dependency — neither can read a replayable admin token.

## Phases

| Phase | Gate | Behavior |
|---|---|---|
| **1** (this build) | always | Allowlisted, SSE-aware reverse proxy for `/api/admin/*` → admin API; `GET /bff/healthz`; everything else `404`. The browser's `Authorization` header is forwarded **unchanged** — a no-behavior-change skeleton that can deploy ahead of the SPA migration. |
| **2** | `BFF_CLIENT_ID` set | Authorization-Code + PKCE login (`/bff/login`, `/bff/callback`), server-side sessions, the session cookie, `/bff/session` + `/bff/logout`, and session→token injection on the proxy (with dual-mode pass-through when there is no session). |

## Configuration

See [`.env.example`](./.env.example). Phase 1 only needs `BFF_LISTEN_ADDR` and
`BFF_ADMIN_UPSTREAM`. Empty `BFF_CLIENT_ID` ⇒ Phase 1.

## Security model

- **Allowlist, never an open proxy.** Only `/bff/*` and `/api/admin/*` are served;
  the `ServeMux` cleans paths, so `/api/admin/../x` can't traverse to the upstream.
- **Loopback only.** Bind `127.0.0.1`; the admin API stays loopback too — there is
  no public path to either.
- **SSE-aware.** `FlushInterval = -1` so the security event stream isn't buffered.

## Develop

```bash
go test -race ./...   # tests against an httptest mock — no external deps
go vet ./... && gofmt -l .
go build -o socrate-admin-bff .

# run (Phase 1)
BFF_LISTEN_ADDR=127.0.0.1:8091 BFF_ADMIN_UPSTREAM=http://127.0.0.1:8081 ./socrate-admin-bff
```

Container: `docker build -t socrate-admin-bff bff/` (distroless, non-root).

Deployment (systemd unit, Caddy site, build/push scripts) lives in
[`../deploy/`](../deploy/).
