# Security Posture — Socrate Superadmin Portal

This SPA is the privileged admin surface for the Socrate OAuth2/OIDC platform.
It is held to the same hardening bar as the backend: it must not become the weak
link or a vector into the server. This document records the controls that are
enforced in code, plus the deployment requirements the host must provide.

## Automated gates

Run before every release (CI-ready):

```bash
npm run security:check   # npm audit (high+) + ESLint security gate
npm run build            # vue-tsc type check + production build
npm run test:run         # unit + integration tests
```

- **Dependencies:** `npm audit` reports **0 known vulnerabilities** (production
  and dev). Keep it that way — `security:check` fails the build on any high+
  advisory.
- **ESLint is a security gate, not a style linter** (`eslint.config.js`). It
  blocks, as errors: `eval`/`new Function`/implied-eval, `javascript:` URLs,
  assignment to `innerHTML`/`outerHTML`/`insertAdjacentHTML`, and Vue `v-html`.
  No security-plugin dependencies are added, to keep the supply chain minimal.

## Runtime controls (enforced in code)

- **Access tokens live in memory only** (`src/services/api.ts`) — never written
  to `localStorage`/`sessionStorage`. A page reload intentionally drops the
  token and re-establishes the session via the HttpOnly refresh cookie.
- **Transport security:** `src/utils/secureConfig.ts` throws at startup if the
  API origin is not `https://` in production builds.
- **CSRF mitigation:** every request carries an `X-Requested-By: oauth2-admin`
  header; the API is configured to reject cross-site requests.
- **No XSS sinks:** the codebase uses no `v-html`, `innerHTML`, `eval`, or
  `document.write`; the ESLint gate prevents regressions.
- **Open-redirect protection:** post-login redirects accept only internal,
  single-leading-slash relative paths (`LoginView`/`MfaVerify` `safeRedirect`).
- **Admin MFA:** TOTP is enforced server-side; the portal speaks the backend's
  re-submit protocol and never holds a long-lived MFA token.
- **No source maps in production** (`vite.config.ts` `build.sourcemap: false`)
  so application source is not exposed to the browser.
- **Self-hosted fonts** — no external CDN requests.

## Deployment requirements (host-provided)

These cannot be set from a static SPA and MUST be delivered as HTTP response
headers by the reverse proxy (see `index.html` and `docs/security-headers.md`):

- `Content-Security-Policy` (default-src 'none'; script-src 'self'; …;
  `frame-ancestors 'none'`; `connect-src` limited to the API origin)
- `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- Serve only over HTTPS (HSTS recommended).

The single configured origin (`VITE_ADMIN_API_URL`) must front both the Admin
API (`/api/admin/*`) and the public OAuth API (`/api/auth/*`, `/api/profile`)
so the portal never talks cross-origin with credentials.

## Reporting

Report suspected vulnerabilities privately to the Socrate maintainers; do not
open a public issue with exploit detail.
