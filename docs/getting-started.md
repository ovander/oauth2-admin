# Getting Started (Local Development)

This guide takes you from a clean clone to a working admin login against a local
Socrate (`go-oauth2`) backend. The SPA is a public PKCE client, so **a few
backend settings must match** — most "it won't log in" problems are a mismatch
between the two. The [Troubleshooting](#troubleshooting) table maps every common
error to its fix.

> Architecture context: [`../ARCHITECTURE.md`](../ARCHITECTURE.md). The key fact
> is that Socrate has **two origins** — the OIDC issuer (`:8080`) and the admin
> API (`:8081`) — and the SPA needs a config value for each.

---

## 1. Prerequisites

- **Node.js 20+** and npm.
- A running **Socrate `go-oauth2`** backend (dual-port: `:8080` public, `:8081`
  admin) with a reachable database.

## 2. Backend prerequisites (do these first)

The SPA cannot log in until the backend registers it as a PKCE client and the
schema exists. On the backend:

```bash
# 1. Register the admin console as a public PKCE client (auto-registered at
#    startup ONLY when BOTH of these are set; the redirect URI must be EXACT).
ADMIN_CONSOLE_CLIENT_ID=admin-console
ADMIN_CONSOLE_REDIRECT_URIS=http://localhost:5173/auth/callback

# 2. Disable the deprecated password login (the SPA is PKCE-only)
ADMIN_PASSWORD_LOGIN_ENABLED=false

# 3. Allow the SPA origin for CORS (covers both ports) AND the custom CSRF header
ALLOWED_ORIGINS=http://localhost:5173
#   → add "X-Requested-By" to the CORS AllowedHeaders list (router.go)

# 4. Create the schema at least once (authorization_codes, used_tokens, …)
AUTO_MIGRATE=true        # run once, then you may set back to false
```

Restart the backend and confirm the startup log shows:

```
registered first-party admin console client "admin-console" (public, PKCE) with 1 redirect URI(s)
✅ Socrate initialized … "admin_console_pkce": true
```

Then **seed a superadmin** (the admin portal only accepts `superadmin` accounts):

```bash
# in the go-oauth2 repo
go run ./cmd/seed -email you@example.com -name "You" -password 'AStrongP@ssw0rd1!'
# omit -password to get a generated one; add -force to update an existing user
```

> The seeded account has `must_change_password=true`, so your first login lands
> on the forced change-password screen by design — set a new password and continue.

## 3. SPA setup

```bash
npm install
cp .env.example .env.local      # then edit (see below)
```

`.env.local` for split-port dev:

```bash
VITE_OIDC_ISSUER=http://localhost:8080      # authorize / token / refresh / logout
VITE_ADMIN_API_URL=http://localhost:8081    # /api/admin/* (Bearer)
VITE_OAUTH_CLIENT_ID=admin-console          # MUST equal backend ADMIN_CONSOLE_CLIENT_ID
VITE_OAUTH_SCOPES=openid email profile
VITE_OAUTH_REDIRECT_PATH=/auth/callback     # origin+path MUST be in ADMIN_CONSOLE_REDIRECT_URIS
```

> **Single-gateway / production:** point both `VITE_ADMIN_API_URL` and
> `VITE_OIDC_ISSUER` at the gateway origin (or leave `VITE_OIDC_ISSUER` unset to
> default to `VITE_ADMIN_API_URL`). Production builds require `https://`.

## 4. Run

```bash
npm run dev        # http://localhost:5173 (port is pinned)
```

Open <http://localhost:5173> → **Sign in** → you're redirected to the Socrate
hosted login on `:8080` → after auth you return to `/auth/callback` → forced
password change (first login) → **Dashboard**. 🎉

## 5. Other commands

```bash
npm run test:run     # unit + integration tests (Vitest)
npm run build        # type-check (vue-tsc) + production build
npm run preview      # serve the build under the strict production CSP
npm run lint:check   # ESLint (security gate)
npm run security:check  # npm audit (high+) + lint
```

---

## Troubleshooting

Every wall you can hit during first setup, and the fix. The backend logs the
real cause — the SPA only surfaces what the authorization server returns.

| Symptom | Cause | Fix |
|---|---|---|
| `invalid_client` / "Unknown client" on `/oauth/authorize` | `client_id` the SPA sends ≠ a registered client | Make `VITE_OAUTH_CLIENT_ID` == backend `ADMIN_CONSOLE_CLIENT_ID`; confirm startup log `admin_console_pkce: true`. |
| `invalid_request` / "redirect_uri is not registered" | Registered redirect URI ≠ what the SPA sends | Set `ADMIN_CONSOLE_REDIRECT_URIS` to **exactly** `http://localhost:5173/auth/callback`. The seeder **does not update an existing client** — use a fresh client id or delete the old client to re-seed. |
| `server_error` / "authorization failed" (callback has `?error=`) | `Authorize()` failed writing the code — usually the `authorization_codes` table is missing | Set `AUTO_MIGRATE=true`, restart once. Look for a GORM `relation … does not exist` error in the backend log. |
| CORS: "No 'Access-Control-Allow-Origin' header" on `/oauth/token` | Preflight rejected — the `X-Requested-By` header isn't allow-listed (or origin not allowed) | Add `X-Requested-By` to the backend CORS `AllowedHeaders`; ensure `ALLOWED_ORIGINS` includes `http://localhost:5173`. |
| Login page renders **unstyled** | The hosted login was tunnelled through the SPA dev proxy, so its `/static` assets 404 | Point `VITE_OIDC_ISSUER` directly at `http://localhost:8080` so the page loads from its own origin. |
| Login form just re-renders (no redirect) | Wrong password, or the account isn't a `superadmin` | Seed/verify a superadmin (`cmd/seed`); the admin portal rejects non-superadmins. |
| Lands on change-password every login | The account has `must_change_password=true` (seeder default) | Complete the change once; subsequent logins go straight to the dashboard. |
| Session drops on every reload (login works) | Refresh cookie is `Secure`; over plain `http://localhost` the browser may reject it | Run the backend over HTTPS, or set its refresh-cookie `Secure` flag to false in dev. |
| App throws at startup: "VITE_ADMIN_API_URL is required" | Missing `.env.local` value | Set `VITE_ADMIN_API_URL` (and the OAuth vars). |
