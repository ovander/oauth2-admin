# ADR-0006: Interceptor-driven `401` / `403` auth flows

**Status:** Accepted

## Context

Three cross-cutting auth behaviors must apply to *every* admin API call: silent
refresh on access-token expiry (`401`), step-up on `403 elevation_required`, and
the forced-password-change gate on `403 password_change_required`. Implementing
these per view would be repetitive and easy to miss.

## Decision

Centralise them in the `api.ts` Axios **response interceptor**, backed by
`services/adminGuards.ts`:

- **`401`** → one shared `refreshAccessToken()`, with a queue so concurrent
  failures cause a single refresh; on success, retry; on failure, route to login.
- **`403 elevation_required`** → `requireElevation()` opens a global
  `ElevationDialog`, and the original request is retried once with the fresh
  elevated token.
- **`403 password_change_required`** → set a global flag; the router guard +
  `App.vue` watcher route to `/auth/change-password`.

The token/refresh/elevate/change-password endpoints are **excluded** from the
`401`-refresh dance so their own `401`/`403` codes are never masked.

## Consequences

- Destructive admin views need no per-call auth code — the interceptor handles
  step-up, refresh and the password gate uniformly.
- New auth challenge codes are added in one place.
- Care is required to keep auth-flow endpoints out of the refresh retry (a
  regression there would loop or hide the real error).
