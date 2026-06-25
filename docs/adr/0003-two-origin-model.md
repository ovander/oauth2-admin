# ADR-0003: Separate OIDC issuer and admin resource-server origins

**Status:** Accepted

## Context

Socrate runs split-port: the **OIDC issuer** (`:8080`) serves `/oauth/*`,
`/api/auth/*`, `/api/profile`, `/.well-known/*` and the hosted login's
`/static/*`; the **admin resource server** (`:8081`) serves `/api/admin/*` only.
They do not overlap. The SPA initially assumed a single base URL, which is wrong
in two ways: it can't address both routers, and tunnelling the hosted login
through the SPA dev proxy broke its `/static` assets (unstyled page).

## Decision

Model the two origins explicitly:

- `VITE_OIDC_ISSUER` → authorize, token, refresh, **logout** — `services/oauth.ts`
  and the `issuerApi` axios instance (credentials on, for the cookie).
- `VITE_ADMIN_API_URL` → `/api/admin/*` — the `api` axios instance (Bearer only).
- `VITE_OIDC_ISSUER` defaults to `VITE_ADMIN_API_URL` for single-gateway/prod
  deployments, so a fronted setup needs only one value.

The OIDC `authority` is the issuer, matching the `iss` claim and OIDC discovery.

## Consequences

- The hosted login renders from the issuer origin (styled, assets load).
- Token/refresh/logout calls are cross-origin to the issuer; the admin API is
  cross-origin too — both rely on the backend's `ALLOWED_ORIGINS` (CORS, both
  ports) and the allow-listed `X-Requested-By` header (ADR-0005).
- **Logout must hit the issuer** (`/api/auth/logout`), not the admin API — that's
  where the cookie lives. Routing it to the admin API would silently fail.
