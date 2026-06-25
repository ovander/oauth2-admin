# Socrate — Superadmin Portal

A modern, production-ready **Superadmin Portal** for the [Socrate](https://github.com/ovander/go-oauth2) OAuth2 / OpenID Connect platform, built with Vue.js 3, PrimeVue 4, and Tailwind CSS 4.

> ⚠️ **This portal is for Superadmins only.** Superadmins manage the Socrate OAuth2 server itself — creating applications, managing global users, and monitoring server-wide security. App Admins should use their application's admin interface.

![OAuth2 Admin](https://img.shields.io/badge/Vue.js-3.5-green)
![PrimeVue](https://img.shields.io/badge/PrimeVue-4.2-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-cyan)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)

## Architecture

The console is a **cookie-session SPA** fronted by a Go **Backend-for-Frontend
(BFF)**. The browser holds no OAuth tokens — only an opaque, HttpOnly session
cookie. The BFF is the confidential OAuth client: it runs the Authorization Code
+ PKCE flow server-side and injects the bearer onto every upstream call. Every
authenticated request the browser makes is same-origin.

```
                      admin.vandermoten.eu (Caddy — only public listener)
  ┌─────────┐ HTTPS   ┌────────────────────────────────────────────────┐
  │ Browser │ ──────▶ │ /              → built SPA (file_server)         │
  │ cookie  │         │ /bff/*  /api/admin/*  /api/profile → admin BFF   │
  │ + csrf  │         └────────────────────────────────────────────────┘
  └─────────┘                              │ loopback
                                           ▼
                            ┌────────────────────────────┐
                            │ admin BFF (Go, stdlib)      │
                            │  • confidential OAuth client│
                            │  • server-side sessions     │
                            │  • injects Bearer, strips   │
                            │    the session cookie        │
                            └────────────────────────────┘
                          :8081 admin API   │   :8080 Socrate issuer
```

The admin API (`:8081`) is loopback-only — the BFF is its sole client.

📖 **Full design, sequence diagrams and security properties:
[`docs/architecture.md`](docs/architecture.md).**

## Features

### Dashboard
- Real-time statistics for applications, users, and sessions
- Login activity trends with interactive charts
- System health monitoring
- Recent activity feed
- Quick action shortcuts

### Applications Management
- Full CRUD operations for OAuth2 applications
- Client ID/Secret management with secure regeneration
- Configure redirect URIs, grant types, and scopes
- PKCE enforcement toggle
- Token TTL configuration
- Per-application user management

### User Management
- User listing with search and filtering
- Role-based access control (Super Admin, App Admin, App Manager, Viewer)
- Account status management (lock/unlock)
- Password reset functionality
- Email verification status
- Bulk actions support

### Security & Audit
- Security dashboard with threat metrics and a live event stream (SSE)
- Security event log with filtering
- Active session monitoring across all applications
- Blocked-IP management and per-IP reputation lookup
- Alert rules (create/edit/delete) and triggered-alert history with acknowledgement
- Token analytics and geographic login activity
- On-demand security report generation and download
- Comprehensive admin audit logs with export

### Settings & Profile
- Server configuration overview
- Connection health checks
- Feature toggles visibility
- Profile management
- Email-based password reset
- Own active-session overview
- Dark/Light theme toggle

## Tech Stack

- **Framework**: Vue.js 3.5 with Composition API
- **UI Library**: PrimeVue 4.2 with Aura theme
- **Styling**: Tailwind CSS 4.0
- **State Management**: Pinia
- **Routing**: Vue Router 4
- **HTTP Client**: Axios
- **Charts**: Chart.js via PrimeVue
- **Date Handling**: date-fns
- **Build Tool**: Vite 6
- **Type Checking**: TypeScript 5.6

## Project Structure

```
.
├── bff/                      # Go BFF (stdlib only) — confidential OAuth client
├── deploy/                   # Caddy + systemd + scripts for production
├── docs/                     # architecture.md, security-headers.md
└── src/                      # the Vue SPA (below)
```

```
src/
├── assets/
│   └── tailwind.css          # Tailwind configuration and custom styles
├── components/
│   ├── dashboard/            # Dashboard-specific components
│   │   ├── ActivityFeed.vue
│   │   ├── QuickActions.vue
│   │   ├── StatCard.vue
│   │   └── SystemHealth.vue
│   └── ui/                   # Reusable UI components
│       ├── EmptyState.vue
│       ├── LoadingState.vue
│       ├── PageHeader.vue
│       └── StatusBadge.vue
├── composables/              # Vue composables
│   ├── useClipboard.ts
│   ├── useConfirm.ts
│   └── useToast.ts
├── layouts/
│   ├── AdminLayout.vue       # Main admin layout with sidebar
│   └── AuthLayout.vue        # Authentication pages layout
├── router/
│   └── router.ts             # Route definitions and guards
├── security/
│   └── csp.ts                # Canonical CSP + Trusted Types policy
├── services/                 # API services
│   ├── api.ts                # Same-origin admin client + interceptors (CSRF, 401)
│   ├── session.ts            # BFF control-plane client (/bff/*) + csrfStore
│   ├── adminGuards.ts        # Step-up (elevation) + forced-password-change state
│   ├── authService.ts        # Profile / change-password / reset
│   ├── monitoringService.ts  # Security dashboards + SSE event stream
│   ├── applicationService.ts
│   ├── dashboardService.ts
│   ├── securityService.ts
│   ├── settingsService.ts
│   └── userService.ts
├── stores/                   # Pinia stores
│   ├── authStore.ts
│   └── themeStore.ts
├── types/                    # TypeScript type definitions
│   ├── application.ts
│   ├── auth.ts
│   ├── dashboard.ts
│   ├── security.ts
│   └── user.ts
├── utils/                    # Utility functions
│   ├── devlog.ts
│   └── formatDate.ts
├── views/                    # Page components
│   ├── applications/
│   ├── auth/
│   ├── dashboard/
│   ├── errors/
│   ├── logs/
│   ├── security/
│   ├── settings/
│   └── users/
├── App.vue
└── main.ts
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+ or pnpm 8+

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment Variables

The SPA talks to its own origin (the BFF), so it needs almost no config — both
vars below default to same-origin and are normally left unset. See
`.env.example` for details and the dev proxy setup.

```env
# Admin API base — leave UNSET for the same-origin BFF deployment.
# VITE_ADMIN_API_URL=
# Public issuer origin — used ONLY for forgot/reset password. Leave UNSET for
# same-origin / dev proxy.
# VITE_OIDC_ISSUER=
```

The BFF itself is configured via `BFF_*` env vars — see [`bff/README.md`](bff/README.md).

## API Integration

In production the browser only ever calls **same-origin** paths; Caddy routes
`/bff/*`, `/api/admin/*` and `/api/profile` to the BFF and serves the SPA for
everything else. The BFF injects the bearer before forwarding to the loopback
admin API (`/api/admin/*` prefix) or the issuer (`/api/profile`).

### Authentication & session (handled by the BFF)
- `GET  /bff/login` / `GET /bff/callback` — Authorization Code + PKCE, server-side
- `GET  /bff/session` — bootstrap `{ authenticated, user, csrf }`
- `POST /bff/logout` — revoke session + clear cookie
- `POST /bff/elevate` — server-side step-up (re-auth) for sensitive actions
- `GET  /api/admin/profile` — current superadmin profile

### Application Management
- `GET /api/admin/apps` - List all applications
- `POST /api/admin/apps` - Create application
- `GET /api/admin/apps/:id` - Get application details
- `PUT /api/admin/apps/:id` - Update application
- `DELETE /api/admin/apps/:id` - Delete application
- `POST /api/admin/apps/:id/regenerate-secret` - Regenerate client secret

### User Management (Global)
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create user
- `GET /api/admin/users/:id` - Get user details
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user
- `POST /api/admin/users/:id/lock` - Lock user account
- `POST /api/admin/users/:id/unlock` - Unlock user account

### Security & Audit
- `GET /api/admin/security-logs` - Security events
- `GET /api/admin/logs` - Admin audit logs
- `GET /api/admin/dashboard/stats` - Dashboard statistics
- `GET /api/admin/dashboard/health` - System health

### Settings
- `GET /api/admin/settings/config` - Server configuration
- `GET /api/admin/settings/test-db` - Test database connection
- `GET /api/admin/settings/test-cache` - Test cache connection
- `GET /admin/logs` - Admin audit logs
- `GET /admin/dashboard/*` - Dashboard statistics

## Authentication

The BFF is the confidential **OAuth client**; the SPA holds **no tokens**.
Credentials and MFA are handled by the authorization server's hosted login.

1. The user clicks **Sign in** → full-page navigation to `/bff/login`. The BFF
   creates the PKCE `code_verifier`/`state` (server-side, single-use) and
   redirects to the issuer `/oauth/authorize` (`code_challenge_method=S256`).
2. After authenticating (incl. MFA), the browser returns to `/bff/callback`. The
   BFF validates `state`, exchanges the code for tokens at `/oauth/token`, stores
   them in a **server-side session**, and sets an opaque `__Host-admin_session`
   cookie (HttpOnly · Secure · `SameSite=Strict`).
3. The SPA bootstraps via `GET /bff/session` → `{ authenticated, user, csrf }`.
   It sends the CSRF token in `X-CSRF-Token` on every state-changing request.
4. For each `/api/admin/*` call the BFF resolves the session, checks CSRF,
   **proactively refreshes** the token if near expiry, injects
   `Authorization: Bearer …`, strips the cookie, and proxies to the loopback
   admin API. On `401` the SPA routes to login.
5. Sensitive actions trigger `403 elevation_required`; the SPA prompts and posts
   to `/bff/elevate`, which re-authenticates server-side and elevates the session.

See [`docs/architecture.md`](docs/architecture.md) for sequence diagrams.

## Role-Based Access Control

| Role | Dashboard | Apps | Users | Security | Logs | Settings |
|------|-----------|------|-------|----------|------|----------|
| Super Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| App Admin | ✓ | ✓ | Limited | ✓ | - | Limited |
| App Manager | ✓ | Limited | Limited | - | - | Limited |
| Viewer | ✓ | View Only | - | - | - | - |

## Customization

### Theme Colors

Edit `tailwind.config.js` to customize the color palette:

```js
theme: {
  extend: {
    colors: {
      brand: {
        // Your custom brand colors
      },
      accent: {
        // Your custom accent colors
      }
    }
  }
}
```

### PrimeVue Theme

The application uses PrimeVue's Aura theme with dark mode support. Customize in `main.ts`:

```ts
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.dark'
    }
  }
})
```

## Build & Deployment

```bash
npm run build   # → dist/ (static assets)
```

Production deployment is **not** a plain static host: the SPA needs its BFF and
the Caddy routing in front of it. The repo ships a complete kit in
[`deploy/`](deploy/README.md):

- **`deploy/Caddyfile`** — serves `dist/` and reverse-proxies `/bff/*`,
  `/api/admin/*` and `/api/profile` to the BFF (`127.0.0.1:8091`); CSP + HSTS.
- **`deploy/systemd/socrate-admin-bff.service`** — hardened unit for the BFF
  (loopback-bound, `NoNewPrivileges`, `ProtectSystem=strict`, seccomp filter).
- **`deploy/env/`** + **`deploy/scripts/`** — secrets template and
  build/push/install/bootstrap helpers.

The BFF (Go, stdlib-only) lives in [`bff/`](bff/README.md) and is the only client
of the loopback admin API.

## License

MIT License - See LICENSE file for details.
