# Changelog

All notable changes to the Socrate admin console are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- BFF: backendkit v1.15.0 → v1.21.0. The BFF code is unchanged and no exported identifier it uses
  changed. The upgrade brings fail-closed handling of a `client_credentials` response without an
  access token, the service-token expiry read from its `exp` claim, and a startup warning in
  `jwtauth` when no audience is configured (the BFF does not use `jwtauth`).

## [1.6.1] - 2026-10-06

Patch release: Vue 3.5.43 and source-map-js 1.2.2 close two high advisories. **Deploy notes:** no
BFF environment variable, Caddy or CSP change.

### Security
- **Vue 3.5.43** (was 3.5.29) and **source-map-js 1.2.2** (was 1.2.1), lockfile only: they close
  GHSA-g2v6-rqmx-r4w6 (`@vue/server-renderer`, XSS through an attribute name with a carriage
  return) and GHSA-68fv-2mgg-jv7q (`source-map-js`, denial of service through indexed source-map
  offsets), both high, which made the `npm audit` gate fail on `main`. Patch releases of Babel,
  PostCSS and nanoid come with them. No `package.json` change. Two moderate advisories in
  `eslint-plugin-vue` (dev only, below the gate) need a major upgrade and are left for a separate
  change.

## [1.6.0] - 2026-10-05

Minor release. Applications such as Lakebridge can be defined from the console: confidential
applications are created with **Require PKCE** (on by default), and a *Token settings* section edits
audiences, allowed scopes, custom claims and the access-token lifetime; the user page edits the
attributes those claims project (e.g. `tenant_id`). **Deploy notes:** no BFF environment variable,
Caddy or CSP change. Needs Socrate v1.8.0 or later; audiences reach tokens only with
`AUDIENCE_MODE=dual`.

### Added
- **Token settings for applications**, so an application such as Lakebridge can be defined from the
  console. Creating a confidential application now offers **Require PKCE** (on by default; Socrate
  does not allow changing it later, and the form used to create every confidential app without it).
  A new *Token settings* section, on creation and as a card on the application's Settings tab,
  edits the audiences (added to `aud` when Socrate runs `AUDIENCE_MODE=dual`), the allowed scopes,
  the custom claims (claim mappings, issued under Socrate's claims namespace, e.g.
  `https://socrate/tenant_id`) and the access-token lifetime. The card sends only what changed.
  Claim sources, claim names, scopes and the lifetime are checked as Socrate checks them.
- **User attributes** on the user detail page: edit the free-form attributes that claim mappings
  project into tokens (e.g. `tenant_id`). Saving replaces the whole set; non-string values are
  edited as JSON and keep their type; Socrate's limits (32 attributes, 4 KB, names of 64
  characters) are checked before sending.

## [1.5.0] - 2026-10-04

Minor release. Operators can turn on two-factor authentication from My Profile, and the BFF
declares Go 1.27.1. **Deploy notes:** add `/api/profile/mfa /api/profile/mfa/*` to the `@bff`
matcher of the admin Caddy site (as in `deploy/Caddyfile`), otherwise the MFA card cannot load its
status. Needs Socrate v1.7.1 or later. No BFF environment variable or CSP change.

### Changed
- **The BFF declares Go 1.27.1** (`go 1.27.1` in `bff/go.mod`; was `go 1.25.0` with
  `toolchain go1.27.1`, which `go mod tidy` now drops as redundant). Its language level and
  `GODEBUG` defaults match the Go it is built, tested and shipped with. CI reads the Go version from
  the `go` line when there is no `toolchain` line. The proxy keeps wrapping backendkit's
  `httputil.ReverseProxy.Director` (deprecated since Go 1.26, still supported; marked for the
  linter) until backendkit offers a `Rewrite`-based proxy.

### Added
- **Two-factor authentication in My Profile.** An operator can turn on MFA: the console shows the
  authenticator key (with an `otpauth://` link), confirms a code, then shows the recovery codes
  once. When it is on, the card shows how many recovery codes are left, generates new ones, and
  turns MFA off with the password and a code. Nothing is stored in the browser. The BFF allowlists
  the five issuer routes one by one (`GET /api/profile/mfa`,
  `POST /api/profile/mfa/{enroll,confirm,recovery-codes,disable}`, CSRF on the POSTs), and the
  Caddy `@bff` matcher and the dev proxy forward `/api/profile/mfa` and `/api/profile/mfa/*`.
  Needs Socrate v1.7.1, whose sign-in page asks for the code.

## [1.4.0] - 2026-10-01

Minor release. The "Copy .env block" never writes an empty value: a value the console does not
know (the client secret, or Socrate's URLs when they cannot be read) is a commented-out line, so
pasting the block over an application's `.env` no longer erases the working secret. A flaky test
is fixed. No BFF environment variable, Caddy or CSP change; the BFF is unchanged.

### Fixed

- **The "Copy .env block" never writes an empty value.** A value the console does not know (the
  client secret, which Socrate stores only as a hash, and Socrate's URLs when the server
  configuration could not be read) was written as an empty assignment such as
  `SOCRATE_CLIENT_SECRET=`; pasted over an application's existing `.env`, it erased the working
  value. Such a value is now a commented-out line (`# SOCRATE_CLIENT_SECRET=`) with a note to keep
  the existing value. Found during the Ascenda migration.
- Tests: `authService.spec.ts`'s 401 test stubs the redirect to Login, as `api.interceptor.spec.ts`
  does. The real navigation lazy-loaded route views that could finish after the test file's
  environment was torn down, failing CI with an `EnvironmentTeardownError` although every test
  passed. The test now also asserts the redirect.

## [1.3.0] - 2026-09-30

Minor release. The application settings and create forms set the page an application's
magic-link emails open (Socrate's `magic_link_url`), and saving the settings shows Socrate's
error message. No BFF environment variable, Caddy or CSP change; the BFF is unchanged. Needs
Socrate v1.6.0 for the magic-link page to be stored.

### Added

- **The magic-link page of an application.** The application settings form and the create form
  have a "Magic-link page" field: the app's page that magic-link emails open, stored in Socrate
  v1.6.0's `magic_link_url`. The settings form says whether magic links are configured (without a
  page, Socrate answers the app's magic-link requests with `409`), sends the field only when it
  changed, and clears it when emptied. Socrate validates it (https, same origin as a redirect
  URI); its message is shown under the field. Saving the settings now shows Socrate's error text
  instead of a generic "Failed to update application". No BFF, Caddy or CSP change.

## [1.2.0] - 2026-09-30

Minor release. The console shows each application's numeric ID and copies the `SOCRATE_*`
variables for an application's server-side `.env`; axios, brace-expansion and vitest move to
versions without the new advisories. No BFF environment variable, Caddy or CSP change; the BFF is
unchanged. Works with Socrate v1.5.0 and later.

### Added

- **The numeric app ID, and a "Copy .env block" button.** The application list, the detail page
  and the "application created" page show the app's numeric ID (with a copy button next to the
  client ID). Socrate's app routes (`/api/apps/{id}/…`) and backendkit's `SOCRATE_APP_ID` need it,
  and it was not visible anywhere. The detail and "created" pages also copy the `SOCRATE_*`
  variables an app's backend needs, under the names backendkit's integration guide uses:
  `SOCRATE_ISSUER`, `SOCRATE_BASE_URL`, `SOCRATE_JWKS_URL` (from Socrate's `issuer_url`),
  `SOCRATE_ADMIN_BASE_URL` (the apps-host tunnel, `http://127.0.0.1:18082`, by default),
  `SOCRATE_CLIENT_ID`, `SOCRATE_CLIENT_SECRET` and `SOCRATE_APP_ID`. The client secret is filled in
  only on the pages that already show it once (creation, rotation); otherwise it is left empty,
  since Socrate keeps only its hash. No BFF, Caddy or CSP change.

### Security

- **Dependency updates for new advisories.** axios 1.20.0 (several high-severity advisories on
  1.0.0–1.19.0: prototype-pollution gadgets, header injection, ReDoS, redirect handling),
  brace-expansion 1.1.21 / 2.1.7 / 5.0.12 (high: quadratic expansion and recursion DoS, via
  minimatch in dev tooling) and vitest / @vitest/coverage-v8 4.1.11 (moderate: path traversal in
  @vitest/mocker, dev only). `npm audit` reports no advisory; the audit gate was failing on `main`.

## [1.1.0] - 2026-09-29

Minor release. The BFF attributes its own Socrate calls (sign-in, refresh, sign-out, step-up) to
the browser, so Socrate audits and rate-limits the user's IP and User-Agent rather than the BFF,
and no longer forwards a client-supplied `X-Forwarded-For`; it gains a CSP report endpoint for
the Trusted Types Report-Only policy; builds move to Node.js 24. Requires backendkit v1.15.0.
Deploy: the BFF first, then two header lines in the Caddy site (see *Added* below). Works with
Socrate v1.5.0 and later.

### Security

- **Browser attribution toward Socrate, and no forged `X-Forwarded-For` through the proxy.** The
  BFF now tells Socrate which browser each call is for (`bff/attribution.go`, backendkit
  v1.15.0 client attribution): the code exchange, refresh, logout revocations and step-up carry
  `X-Forwarded-For: <client IP>` and the browser's `User-Agent` instead of appearing as
  `127.0.0.1` / `Go-http-client`. Proxied requests (`/api/admin/*`, `/api/apps/*`,
  `/api/profile`, `/api/version`, the password-reset posts) used to append the peer to the
  inbound `X-Forwarded-For`, so a peer reaching the BFF without Caddy could put a forged
  address left-most, where Socrate reads it; they now send `<client IP>, <BFF peer>` with the
  client IP resolved by the BFF (from Caddy's header only over loopback). No deploy step beyond
  the release; the Caddy site is unchanged.

### Added

- **CSP report endpoint and the Trusted Types Report-Only header at the edge.** The BFF serves
  `POST /bff/csp-report` (`bff/cspreport.go`): no session and no CSRF token, because browsers
  send reports without either, which is safe because it only logs. It accepts
  `application/csp-report` and `application/reports+json` (`415` otherwise), caps the body at
  8 KiB (`413`), is rate-limited per IP by the new `BFF_CSP_REPORT_RATE` (default 30 a minute,
  `429`), and logs one `csp-report:` line per violation (at most 10 per request) with query
  strings and fragments stripped from every URL. `productionCspReportOnly()` gains
  `report-uri /bff/csp-report; report-to csp`, `csp.ts` exports `REPORTING_ENDPOINTS`
  (`csp="/bff/csp-report"`), and `deploy/Caddyfile` and `vite preview` now send
  `Reporting-Endpoints` and `Content-Security-Policy-Report-Only`; `csp.spec.ts` checks both
  against `csp.ts`. The enforced CSP is unchanged. Deploy: the BFF first (optional
  `BFF_CSP_REPORT_RATE` in `/etc/socrate/admin-bff.env`), then the two header lines in the Caddy
  site and a reload.

### Changed

- Build and CI toolchain: Node.js 20 (end of life since 2026-04-30) → Node.js 24 LTS; `.nvmrc` and `engines` pin it.

## [1.0.0] - 2026-09-29

First tagged release of the Socrate admin console: a Vue 3 superadmin portal with a Go
Backend-for-Frontend that keeps every token server-side. It ships under Apache-2.0, with the
canonical Content Security Policy enforced at Caddy, the Trusted Types rollout staged
(report-only), per-IP budgets on the public password-reset posts, and the version badge showing
the console and server builds with their toolchains. Requires Socrate v1.4.0 or later (v1.5.0 for
the server toolchain in the badge).

### Added

- **Build toolchains in the version badge**: a plain-text tooltip (`title` and `aria-label`) shows
  the console's version, build date, Node.js and Vite versions, and the server's version, commit,
  branch, `build_time` and `go_version` (optional: servers up to v1.4.0 do not send it), without a
  doubled `v` for a server version that already starts with `v`.
- **Apache-2.0 licence** (`LICENSE`, and `license` in `package.json`) and the contributor kit:
  `CONTRIBUTING.md`, `CLAUDE.md`, `CODEOWNERS`, issue forms, a pull-request template and this
  changelog.
- `SECURITY.md` now opens with how to report a vulnerability (GitHub private vulnerability
  reporting), the scope and the supported versions; the security-posture content is unchanged.

### Changed

- README: a row of self-updating badges (CI status, licence, Go version) under the title.
- Documentation brought to the suite's standard and checked against the code (README,
  `bff/README.md`, `docs/`, `deploy/README.md`, `SECURITY.md`, `CONTRIBUTING.md`, the
  `.env.example` comments and the GitHub templates): full local setup and testing sections, the
  access-policy editor, the enforced role guard, the complete list of proxied routes, and the BFF
  described as built on backendkit.

### Removed

- Internal reports in office formats (security audit, remediation report, assurance review,
  production-readiness report, deployment runbook) left the repository; `.gitignore` now keeps
  root-level `.docx`/`.pdf`/`.xlsx`/`.pptx` files out.

### Security

- `deploy/Caddyfile` now sends the canonical CSP from `src/security/csp.ts` verbatim:
  `default-src 'none'` instead of `'self'`, and `font-src 'self'` without `data:`. Loading the
  built app under the strict policy showed no violation and no `data:` font, so the relaxations
  were unneeded. `csp.spec.ts` now fails if the Caddyfile's CSP or hardening headers drift from
  `csp.ts`. Deploy: re-run `bootstrap.sh` on the host (`push.sh` does not ship the Caddyfile)
  and reload Caddy.
- The Trusted Types rollout policy (`productionCspReportOnly()`) is now
  `require-trusted-types-for 'script'; trusted-types vue default`: `trusted-types default` refused
  Vue's `vue` policy, so every page reported a violation and, enforced, rendered blank. The app
  now creates the `default` policy itself (`src/security/trustedTypes.ts`); it lets only the
  empty string through (PrimeVue's tooltip `innerHTML = ''`) and rejects everything else. Built
  app in Chromium, 21 routes, Report-Only and enforced: no violation. The Report-Only header
  stays off the edge until the BFF has a report endpoint (`docs/security-headers.md`). Deploy:
  the SPA only; the Caddyfile is unchanged.

### Fixed

- The version store read `git_commit` and `build_date` from Socrate's `GET /api/version`, which
  returns `version`, `commit`, `branch` and `build_time`, so `useVersionInfo().backendCommit` and
  `backendDate` were always `…`. The store and composable now read the server's field names, with a
  unit test on a realistic body. Stale-tab detection (keyed on `version`) is unchanged.
- The Vite dev proxy now sends the BFF the same paths as production (`/api/apps/*`,
  `/api/profile`, `/api/version` and the two password-reset posts were missing or went to the
  issuer): an application's Users and Activity tabs and the server version load under
  `npm run dev`, and saving your own profile no longer logs you out. The table moved to
  `src/dev/devProxy.ts`, and a unit test checks it against `deploy/Caddyfile`.
- The README declared an MIT licence with no licence file; the project is Apache-2.0.
- The BFF now reads `BFF_PASSWORD_RESET_RATE` (default 5 per minute). It was declared but never
  loaded, so the two public password-reset posts had no per-IP budget despite the value in the
  env templates. A zero, negative or invalid value falls back to the default.

Changes before this changelog was introduced are in the git history.

[Unreleased]: https://github.com/ovander/oauth2-admin/compare/v1.6.1...HEAD
[1.6.1]: https://github.com/ovander/oauth2-admin/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/ovander/oauth2-admin/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/ovander/oauth2-admin/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/ovander/oauth2-admin/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/ovander/oauth2-admin/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ovander/oauth2-admin/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ovander/oauth2-admin/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ovander/oauth2-admin/releases/tag/v1.0.0
