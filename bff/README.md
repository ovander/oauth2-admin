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
| **1** (migration only) | `BFF_CLIENT_ID` unset **and** `BFF_PHASE1_PASSTHROUGH=true` | Allowlisted, SSE-aware reverse proxy for `/api/admin/*` → admin API; `GET /bff/healthz`; everything else `404`. The browser's `Authorization` header is forwarded **unchanged** and there is no CSRF check — an unauthenticated pass-through to the admin API. The BFF **refuses to start** in this mode without the explicit opt-in and logs a WARNING when it does. |
| **2** (default) | `BFF_CLIENT_ID` set | Authorization-Code + PKCE login (`/bff/login`, `/bff/callback`), server-side sessions, the session cookie, `/bff/session` + `/bff/logout`, and session→token injection on the proxy. Fail-closed: no session ⇒ `401` (unless `BFF_ALLOW_PASSTHROUGH=true`, also a logged migration flag). |

## Configuration

See [`.env.example`](./.env.example). Phase 2 needs `BFF_CLIENT_ID` **and**
`BFF_CLIENT_SECRET` plus the public URLs. `LoadConfig` also rejects
`BFF_COOKIE_SECURE=false` on an https origin and non-positive session
lifetimes.

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

# run (Phase 1 pass-through, local only — requires the explicit opt-in)
BFF_PHASE1_PASSTHROUGH=true BFF_LISTEN_ADDR=127.0.0.1:8091 BFF_ADMIN_UPSTREAM=http://127.0.0.1:8081 ./socrate-admin-bff
```

Container: `docker build -t socrate-admin-bff bff/` (distroless, non-root).

Deployment (systemd unit, Caddy site, build/push scripts) lives in
[`../deploy/`](../deploy/).
