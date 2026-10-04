# Socrate admin console

[![CI](https://github.com/ovander/oauth2-admin/actions/workflows/ci.yml/badge.svg)](https://github.com/ovander/oauth2-admin/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/github/license/ovander/oauth2-admin)](LICENSE)
[![Go version](https://img.shields.io/github/go-mod/go-version/ovander/oauth2-admin?filename=bff%2Fgo.mod)](bff/go.mod)

> The superadmin portal for Socrate: applications, users, security and access policy in one
> place, with no token in the browser.

The admin console is the web portal Socrate administrators use to run the identity provider
itself: register OAuth applications, manage global users and superadmins, watch security
events, and edit the central access policy. It is a Vue 3 single-page application with a Go
Backend-for-Frontend (BFF) that holds the OAuth tokens server-side. It is built for Socrate
superadmins, and it needs a Socrate deployment to talk to: Socrate, the suite's OAuth 2.1 /
OpenID Connect server (`ovander/go-oauth2`, not public yet), provides the admin API and the
sign-in.

---

## Table of contents

- [Why the admin console](#why-the-admin-console)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Status](#status)

---

## Why the admin console

An identity provider's admin surface is the most valuable target in the platform: whoever
controls it can mint clients, reset accounts and change who may do what. The console is built
around that:

- **No token in the browser.** The BFF is the confidential OAuth client. The browser holds an
  opaque `__Host-` session cookie, so an XSS or a poisoned dependency cannot steal a replayable
  admin token.
- **A narrow door.** The admin API listens on loopback only. The BFF is its only client, and it
  forwards an explicit list of paths, never anything else.
- **Step-up for sensitive actions.** When the admin API asks for a recent re-authentication, the
  console prompts for it and the BFF absorbs the short-lived elevated token server-side.

## Features

### Dashboard
- Counters for users, active users, sign-ins, sign-ups, applications, failed logins and locked
  accounts
- Login-trend chart, system health (database, server version, uptime, Go version)
- Recent activity, application usage, and shortcuts to common tasks

### Applications
- List, create, edit and delete OAuth applications: name, URL, redirect URIs
- Public clients (PKCE only, no secret) or confidential clients, chosen at creation
- Client-secret rotation, with the new secret displayed for copying
- Per-application users: invite or add, change role, remove, resend verification, force a
  password reset
- Per-application activity log

### Users
- Global user list with role and verification status
- User detail: application memberships, active sessions, revoke tokens, unlock, block, delete
- Invite a user to an application
- Superadmin accounts: create, edit, delete
- Admin activity log

### Security and audit
- Security overview: threat metrics, token statistics, sign-in geography and a live event
  stream (Server-Sent Events)
- Security events with filters and a detail view
- Active sessions across all applications (read-only)
- Blocked IPs: block, unblock, and per-IP reputation lookup
- Alert rules (create, edit, delete) and alert history with acknowledgement
- Security reports: generate, follow, download
- Admin audit log with filters and export

### Access policy
- Editor for Socrate's central access policy (`/api/admin/policy/*`): view and edit rules,
  validate them, and save a new version (the server asks for step-up); a save based on a stale
  version is refused as a conflict
- Version history with restore
- Decision simulator, against the saved rules or the draft
- Recent denials, and the requests the policy would have denied while it is not enforced

### Settings and profile
- Server configuration overview, database and cache connection tests, and which server
  features are on (MFA, password policy, audit logging)
- Own profile (name, email), password-reset email and own active sessions
- Forced password change when the server requires it
- Idle warning and sign-out after 15 minutes of inactivity
- Version badge, and a notice when the server is upgraded under an open tab
- Light and dark theme

### Who can see what

The admin API is the authority: it accepts only global administrators (Socrate roles
`superadmin` and `admin`) and applies its own checks to every route. The console adds a router
guard on top, so pages the server would refuse are not offered:

| Page | `superadmin` | `admin` |
|---|---|---|
| Dashboard, Applications, User detail, Security overview, Events, Sessions, Settings, Profile | ✅ | ✅ |
| Users, Blocked IPs, Alerts, Reports, Access policy, Audit logs | ✅ | Forbidden page |

Any other account cannot load the admin profile and is sent back to the sign-in page. The
guard is in `src/router/router.ts`; role names are normalised in `src/types/auth.ts` and
`src/utils/roles.ts`.

## Tech stack

| Concern | Library / version |
|---|---|
| Framework | [Vue 3](https://vuejs.org/) (v3.5), Composition API |
| Language | TypeScript (v5.6) |
| Build tool | [Vite](https://vite.dev/) (v6) |
| UI components | [PrimeVue](https://primevue.org/) (v4, Aura theme) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) (v4, CSS-first theme in `src/assets/tailwind.css`) |
| State management | [Pinia](https://pinia.vuejs.org/) (v2) |
| Routing | [Vue Router](https://router.vuejs.org/) (v4) |
| HTTP client | [Axios](https://axios-http.com/) |
| Charts | [Chart.js](https://www.chartjs.org/) through PrimeVue |
| Dates | [date-fns](https://date-fns.org/) |
| Unit and integration tests | [Vitest](https://vitest.dev/) (v4), [MSW](https://mswjs.io/), happy-dom |
| End-to-end tests | [Playwright](https://playwright.dev/) |
| BFF | Go (toolchain pinned in `bff/go.mod`), built on the `bff` and `socrate` packages of [backendkit](https://github.com/ovander/backendkit) |
| Edge | [Caddy](https://caddyserver.com/) (TLS, security headers, routing) |

## Architecture

The browser only ever talks to its own origin. Caddy serves the built SPA and sends an explicit
list of paths to the BFF on loopback; the BFF resolves the session, checks CSRF, refreshes the
token when needed, injects the bearer and forwards to Socrate.

```
                       admin.example.com  (Caddy, the only public listener)
  ┌──────────┐ HTTPS ┌────────────────────────────────────────────────────────┐
  │ Browser  │──────▶│ /                            → built SPA (file_server) │
  │ • cookie │       │ /bff/*  /api/admin/*  /api/apps/*                      │
  │ • CSRF   │       │ /api/profile  GET /api/version                         │
  └──────────┘       │ POST /api/auth/{request-password-reset,reset-password} │
                     │                                → admin BFF             │
                     └───────────────────────────┬────────────────────────────┘
                                                 │ loopback
                                                 ▼
                     ┌────────────────────────────────────────────────────────┐
                     │ admin BFF (Go, backendkit/bff)  127.0.0.1:8091         │
                     │ • confidential OAuth client (Authorization Code + PKCE)│
                     │ • server-side sessions, CSRF, token refresh            │
                     │ • injects the bearer, strips the cookie                │
                     └──────────────┬─────────────────────────┬───────────────┘
                                    │ 127.0.0.1:8081          │ 127.0.0.1:8080
                                    ▼                         ▼
                     ┌──────────────────────────┐  ┌───────────────────────────┐
                     │ Socrate admin API        │  │ Socrate issuer            │
                     │ /api/admin/*, /api/apps/*│  │ /oauth/*, /api/profile,   │
                     │ (loopback only)          │  │ /api/version, /api/auth/* │
                     └──────────────────────────┘  └───────────────────────────┘
```

Sign-in is a full-page navigation to `/bff/login`; the BFF runs Authorization Code + PKCE
against Socrate's hosted login (password and MFA), stores the tokens in its session and sets
the cookie. The SPA then reads `GET /bff/session` for the user and the CSRF token. Sequence
diagrams, the endpoint table and the security properties are in
[docs/architecture.md](docs/architecture.md); the BFF's routes and configuration are in
[bff/README.md](bff/README.md).

The SPA's calls live in `src/services/`, one file per area (`applicationService.ts`,
`userService.ts`, `securityService.ts`, `monitoringService.ts`, `policyService.ts`,
`dashboardService.ts`, `settingsService.ts`, `authService.ts`, and `session.ts` for `/bff/*`).
Read them for the exact admin API paths the console uses.

## Project structure

```
.
├── .github/                      # CI workflow, issue forms, PR template, CODEOWNERS
├── bff/                          # Go Backend-for-Frontend (own module, built on backendkit)
│   ├── main.go                   # startup, graceful shutdown
│   ├── config.go                 # BFF_* environment variables and their validation
│   ├── app.go                    # route allowlist, login/callback/session/logout handlers
│   ├── server.go                 # canonical-path filter, health check
│   ├── oauth.go                  # token exchange, refresh, revocation, user derivation
│   ├── elevate.go                # /bff/elevate step-up
│   ├── ratelimit.go              # per-IP budgets
│   ├── *_test.go                 # tests against httptest upstreams
│   ├── .env.example              # BFF configuration template
│   └── Dockerfile                # distroless, non-root image
├── deploy/                       # production kit: Caddyfile, systemd unit, env template, scripts
├── docs/
│   ├── architecture.md           # BFF cookie-session model, flows, security properties
│   └── security-headers.md       # CSP and hardening headers at the edge
├── e2e/                          # Playwright tests (auth flows, guards, security headers)
├── public/                       # favicon and logo
├── scripts/
│   └── npm-audit-gate.sh         # dependency-advisory gate used by CI
├── src/                          # the Vue SPA (below)
├── .env.example                  # SPA configuration template
├── eslint.config.js              # ESLint, used as a security gate (XSS sinks, eval)
├── playwright.config.ts
├── tailwind.config.js            # not loaded by Tailwind 4; the theme is in src/assets/tailwind.css
└── vite.config.ts                # dev proxy, dev/preview headers, Vitest and coverage settings
```

```
src/
├── __tests__/                    # Vitest: unit, integration (MSW), components, router, stores
├── assets/
│   ├── fonts.css                 # self-hosted fonts
│   └── tailwind.css              # Tailwind 4 theme and custom styles
├── components/
│   ├── VersionBadge.vue          # client and server versions
│   ├── dashboard/                # StatCard, ActivityFeed, QuickActions, SystemHealth
│   ├── security/
│   │   ├── ElevationDialog.vue   # step-up re-authentication prompt
│   │   └── SessionTimeoutWarning.vue
│   └── ui/                       # EmptyState, LoadingState, PageHeader, StatusBadge
├── composables/
│   ├── useClipboard.ts
│   ├── useConfirm.ts
│   ├── usePolicyEditor.ts        # state and actions behind the access-policy editor
│   ├── useSessionTimeout.ts      # idle warning and sign-out
│   ├── useToast.ts
│   ├── useVersionCheck.ts        # polls /api/version, flags a server upgrade
│   └── useVersionInfo.ts
├── dev/
│   └── devProxy.ts               # Vite dev-server proxy table (mirrors the Caddy routes)
├── layouts/
│   ├── AdminLayout.vue           # sidebar, top bar, theme toggle
│   └── AuthLayout.vue            # sign-in and password pages
├── router/
│   └── router.ts                 # routes and guards (auth, forced password change, superadmin)
├── security/
│   ├── csp.ts                    # canonical CSP, Trusted Types policy and hardening headers
│   └── trustedTypes.ts           # the app's rejecting Trusted Types `default` policy
├── services/
│   ├── api.ts                    # same-origin Axios instance: cookie, CSRF, 401 handling
│   ├── session.ts                # /bff/* client and CSRF store
│   ├── adminGuards.ts            # step-up and forced-password-change state
│   ├── applicationService.ts     # /api/admin/apps, /api/apps/{id}/users and logs
│   ├── authService.ts            # admin profile, password change and reset
│   ├── dashboardService.ts
│   ├── monitoringService.ts      # sessions, blocked IPs, alerts, reports, SSE event stream
│   ├── policyService.ts          # /api/admin/policy/*
│   ├── securityService.ts        # security events, admin audit log
│   ├── settingsService.ts
│   └── userService.ts            # global users, superadmins, admin activity
├── stores/
│   ├── authStore.ts              # session user and role checks
│   ├── themeStore.ts
│   └── version.ts                # server version from /api/version
├── types/                        # application, auth, dashboard, index, monitoring, policy,
│                                 # security, user
├── utils/
│   ├── devlog.ts                 # logging in development builds only
│   ├── formatDate.ts
│   ├── policy.ts                 # policy editor helpers
│   ├── roles.ts                  # role checks
│   └── secureConfig.ts           # VITE_* parsing; refuses a non-https origin in production
├── views/
│   ├── applications/             # list, create, detail (settings, users, activity)
│   ├── auth/                     # login, change, forgot and reset password
│   ├── dashboard/
│   ├── errors/                   # 403, 404
│   ├── logs/                     # admin audit log
│   ├── security/                 # overview, events, sessions, blocked IPs, alerts, reports, policy
│   ├── settings/                 # settings, profile
│   └── users/                    # list, detail
├── App.vue
├── env.d.ts
└── main.ts
```

## Getting started

### Prerequisites

- Node.js 24 (the version in `.nvmrc`, which CI uses) and npm.
- Go for the BFF: `bff/go.mod` declares `go 1.27.1`, which the Go command downloads for you
  (`GOTOOLCHAIN=auto`).
- A reachable Socrate server with its issuer (by default `:8080`) and its loopback admin API
  (`:8081`).
- In Socrate, a **confidential** OAuth client for the BFF, with the redirect URI
  `http://localhost:5173/bff/callback` for local development (in production,
  `https://admin.example.com/bff/callback`) and the scopes `openid profile email`.
- A Socrate account with the global role `superadmin` (or `admin`, see
  [Who can see what](#who-can-see-what)).

### Install

```bash
git clone https://github.com/ovander/oauth2-admin && cd oauth2-admin
npm ci
```

### Configure

The SPA needs no configuration for local development: it calls its own origin, and the Vite dev
server forwards the API paths. Create a local file only if you need to override something:

```bash
cp .env.example .env.local    # optional; Vite loads .env.local, and git ignores it
```

The BFF reads its settings from the environment only. Start from `bff/.env.example`:

```bash
cp bff/.env.example bff/.env
```

and set, for local development:

```bash
BFF_CLIENT_ID=<the client id registered in Socrate>
BFF_CLIENT_SECRET=<its secret>
BFF_OAUTH_UPSTREAM=http://127.0.0.1:8080      # issuer, back channel
BFF_OAUTH_PUBLIC_URL=http://localhost:8080    # issuer as the browser sees it
BFF_PUBLIC_ORIGIN=http://localhost:5173       # the Vite dev server; the callback lands here
BFF_COOKIE_SECURE=false                       # allowed only with an http:// public origin
```

`bff/.env` is ignored by git. Keep `BFF_SCOPES` quoted (`"openid profile email"`) or delete
the line (that is the default), so that the shell can source the file. All variables and
defaults are listed in [bff/README.md](bff/README.md#configuration).

### Run

In one terminal, the BFF:

```bash
cd bff
set -a && . ./.env && set +a
go run .
```

In another, the SPA:

```bash
npm run dev    # http://localhost:5173
```

The Vite dev server (`src/dev/devProxy.ts`, used by `vite.config.ts`) forwards the same paths to
the BFF on `localhost:8091` as Caddy does in production: `/bff/*`, `/api/admin/*`, `/api/apps/*`,
`/api/profile`, `/api/version` and the two password-reset posts. Only `/oauth/*` goes straight to
the issuer on `localhost:8080`; any other path is served by the SPA. A unit test keeps this table
in step with `deploy/Caddyfile`. Open `http://localhost:5173`, choose **Sign in with Socrate**,
and complete Socrate's hosted login.

### Build

```bash
npm run build      # vue-tsc type check, then the production bundle in dist/
npm run preview    # serve dist/ with the production CSP and the Trusted Types report-only policy
```

### Tests

```bash
npm run coverage        # Vitest with the coverage gate
npx playwright test     # end-to-end; starts its own dev server with mocked APIs
```

The full list of checks is in [Testing](#testing).

## Environment variables

### SPA (`VITE_*`, build time)

Both API variables default to the same origin and are normally left unset, in development and in
production. `.env.example` documents them.

| Variable | Description | Default / example |
|---|---|---|
| `VITE_ADMIN_API_URL` | Base URL of the admin API calls and the security event stream. Set only for a split-origin setup; must be `https://` in a production build. | unset (same origin) |
| `VITE_OIDC_ISSUER` | Public issuer origin. Parsed and checked (`https://` in production) by `src/utils/secureConfig.ts`, but no request uses it today: the password-reset calls go through the BFF. | unset |
| `VITE_BASE` | Base path the built assets are served from (`vite.config.ts`). | `/` |

### BFF (`BFF_*`, runtime)

The BFF variables (client credentials, upstreams, public origins, session lifetimes, cookie and
rate limits) are listed in [bff/README.md](bff/README.md#configuration). In production they live
in `/etc/socrate/admin-bff.env`; see [deploy/README.md](deploy/README.md).

## Testing

These are the checks CI runs; all of them are required:

```bash
npm run lint:check                 # ESLint security gate: no v-html, innerHTML, eval, javascript: URLs
npx vue-tsc -b && npm run build    # type check and production build
npm run coverage                   # Vitest unit and integration tests, coverage thresholds at 80 %
npx playwright test                # end-to-end, Chromium (npx playwright install chromium first)
./scripts/npm-audit-gate.sh        # fails on a high or critical advisory, or on missing audit data
cd bff && go vet ./... && go test -race ./... && golangci-lint run ./...
```

- **Vitest** (`src/__tests__/`) covers the security-critical modules: the API client and its
  interceptors, the BFF session client, step-up and forced password change, the CSP module, the
  auth store, role checks, the router guards and the access-policy editor. MSW mocks the
  backend. The coverage scope and thresholds are in `vite.config.ts`.
- **Playwright** (`e2e/`) runs sign-in, guards, forced password change and password reset
  against the dev server with mocked APIs, and checks that the served app carries the CSP and
  hardening headers.
- **BFF tests** (`bff/*_test.go`) run the BFF against `httptest` upstreams: login binding,
  CSRF, refresh, step-up, the route allowlist, non-canonical paths and rate limits. No Socrate
  instance is needed. golangci-lint is v2.14.0, built with the Go of `bff/go.mod`.

## Deployment

Production is not a plain static host: the SPA needs its BFF and the Caddy routing in front of
it. The kit in [deploy/](deploy/README.md) builds the SPA and the BFF on your workstation, ships
them to the server and installs them:

- `deploy/Caddyfile`: serves `dist/`, sends the allowlisted paths to the BFF on
  `127.0.0.1:8091`, and sets the security headers.
- `deploy/systemd/socrate-admin-bff.service`: the BFF under its own user, with systemd
  sandboxing.
- `deploy/env/admin-bff.env.example` and `deploy/scripts/`: the environment template, and the
  build, push, install and bootstrap scripts.

A container image is also available: `docker build -t socrate-admin-bff bff/`.

## Security

The browser never holds an OAuth token; the BFF is the confidential client and the only client
of the loopback admin API; unsafe requests need a double-submit CSRF token; the Content Security
Policy is defined in `src/security/csp.ts` and served by Caddy. [SECURITY.md](SECURITY.md) lists
the controls enforced in the SPA, the BFF and the deployment, and
[docs/architecture.md](docs/architecture.md) explains the session model.

## Status

The admin console is in active use as part of the Socrate suite. Current focus:

- Keeping the console in step with the admin API, including the access-policy editor
- Test coverage beyond the security-critical modules (views such as applications and users)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the checks CI runs, and the pull-request
workflow; changes are listed in [CHANGELOG.md](CHANGELOG.md). Report vulnerabilities privately as
described in [SECURITY.md](SECURITY.md).

## License

Copyright © 2026 Olivier Vandermoten. Licensed under the Apache License, Version 2.0; see
[LICENSE](LICENSE). SPDX-License-Identifier: Apache-2.0
