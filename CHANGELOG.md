# Changelog

All notable changes to the Socrate admin console are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/ovander/oauth2-admin/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/ovander/oauth2-admin/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ovander/oauth2-admin/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ovander/oauth2-admin/releases/tag/v1.0.0
