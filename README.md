# Socrate — Superadmin Portal

A modern, production-ready **Superadmin Portal** for the [Socrate](https://github.com/ovander/go-oauth2) OAuth2 / OpenID Connect platform, built with Vue.js 3, PrimeVue 4, and Tailwind CSS 4.

> ⚠️ **This portal is for Superadmins only.** Superadmins manage the Socrate OAuth2 server itself — creating applications, managing global users, and monitoring server-wide security. App Admins should use their application's admin interface.

![OAuth2 Admin](https://img.shields.io/badge/Vue.js-3.5-green)
![PrimeVue](https://img.shields.io/badge/PrimeVue-4.2-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-cyan)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Port 8081 (Admin API)                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  SUPERADMIN PORTAL (this frontend)                        │  │
│  │  • Manages OAuth2 server itself                           │  │
│  │  • Creates/manages applications                           │  │
│  │  • Global user administration                             │  │
│  │  • Login: email + password (no app context)               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Port 8080 (OAuth2 API)                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  APP USERS & APP ADMINS                                   │  │
│  │  • App Admins: Manage users within their specific app     │  │
│  │  • App Users: Regular end-users                           │  │
│  │  • Login: email + password + app_client_id                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

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
├── services/                 # API services
│   ├── api.ts                # Axios instance with interceptors
│   ├── applicationService.ts
│   ├── authService.ts
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

Create a `.env` file in the root directory:

```env
# Superadmin API URL (Port 8081 - isolated admin port)
VITE_ADMIN_API_URL=http://localhost:8081
```

See `.env.example` for detailed documentation.

## API Integration

This portal connects to **Port 8081** (Admin API) exclusively. All endpoints use the `/api/admin/*` prefix:

### Authentication (Superadmin only)
- `GET  /oauth/authorize` - Authorization Code + PKCE login (AS hosted login)
- `POST /oauth/token` - Authorization code → token exchange (PKCE `S256`)
- `POST /api/auth/refresh` - Silent refresh via the HttpOnly cookie (rotated)
- `POST /api/auth/logout` - Refresh-token revocation + cookie clear
- `GET  /api/admin/profile` - Current superadmin profile

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

The portal is a first-party **public client** using **Authorization Code + PKCE**
(OAuth 2.1). Credentials and MFA are handled by the authorization server's hosted
login — the SPA never sees them.

1. The user clicks **Sign in**; the SPA generates a PKCE `code_verifier`/`state`
   (stored in `sessionStorage` for the round-trip) and redirects to
   `/oauth/authorize` (`response_type=code`, `code_challenge_method=S256`).
2. After authenticating (incl. MFA) at the AS, the browser is redirected back to
   `/auth/callback?code=…&state=…`.
3. The callback verifies `state` (CSRF/mix-up guard) and exchanges the code +
   `code_verifier` at `/oauth/token`. The **access token is held in memory only**;
   the **refresh token is set as an HttpOnly cookie** by the backend and is never
   exposed to JavaScript.
4. Axios interceptors attach the in-memory access token. On a `401`, a single
   shared helper silently refreshes via the HttpOnly cookie (`/api/auth/refresh`,
   rotated server-side) and retries the request.
5. If refresh fails, the user is redirected to login. A cold page load
   re-hydrates the session the same way (cookie → access token → profile).

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
# Production build
npm run build

# The dist/ folder contains the built assets
# Deploy to any static hosting (Nginx, Apache, Netlify, Vercel, etc.)
```

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name admin.example.com;
    root /var/www/oauth2-admin/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## License

MIT License - See LICENSE file for details.
