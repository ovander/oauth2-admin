# Changelog

All notable changes to the Socrate Superadmin Portal are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Authorization Code + PKCE login.** The console is now a first-party public
  client: sign-in is delegated to the Socrate hosted login (the SPA never sees
  the password or MFA code), `state` is verified against a pre-redirect value,
  and the PKCE `code_verifier` is single-use in `sessionStorage`. The access
  token lives in memory; the refresh token is an HttpOnly cookie. Replaces the
  legacy first-party password (ROPC) flow. (ADR-0001, ADR-0002)
- **Step-up (elevation).** Destructive admin actions that return
  `403 elevation_required` trigger a re-auth prompt and retry once with a fresh
  elevated token — handled centrally, so every admin call is covered. (ADR-0006)
- **Forced password change.** A `403 password_change_required` gates the app to a
  forced change-password page until resolved.
- **Browser hardening.** Canonical, unit-tested CSP + security headers
  (`src/security/csp.ts`) served by the dev/preview servers and mirrored by the
  proxy in production; Trusted Types shipped as a Report-Only rollout. (ADR-0004)
- **Architecture, getting-started, contributing docs** and ADRs.

### Changed
- **Two-origin model.** The OIDC issuer (`VITE_OIDC_ISSUER`, `/oauth/*`,
  `/api/auth/*`, `/api/profile`) and the admin resource server
  (`VITE_ADMIN_API_URL`, `/api/admin/*`) are now separate config values, matching
  Socrate's split-port deployment. Logout, profile and password-reset route to
  the issuer; admin data to the resource server. (ADR-0003)
- **Single refresh path** through `oauth.refreshAccessToken()` against the
  hardened `/oauth/token` refresh grant (cookie-based, rotated). (ADR-0002)

### Security
- Access tokens are never persisted to web storage; the refresh token is an
  HttpOnly, `SameSite=Strict`, path-scoped cookie unreadable by JS.
- CSRF posture: Bearer-auth admin API + `SameSite=Strict` refresh cookie + the
  `X-Requested-By` custom-header check. (ADR-0005)
- Open-redirect protection on post-login navigation; roles normalised to least
  privilege.
