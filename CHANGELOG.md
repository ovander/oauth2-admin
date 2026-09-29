# Changelog

All notable changes to the Socrate admin console are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/ovander/oauth2-admin/commits/main
