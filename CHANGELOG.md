# Changelog

All notable changes to the Socrate admin console are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Apache-2.0 licence** (`LICENSE`, and `license` in `package.json`) and the contributor kit:
  `CONTRIBUTING.md`, `CLAUDE.md`, `CODEOWNERS`, issue forms, a pull-request template and this
  changelog.
- `SECURITY.md` now opens with how to report a vulnerability (GitHub private vulnerability
  reporting), the scope and the supported versions; the security-posture content is unchanged.

### Changed

- Documentation brought to the suite's standard and checked against the code (README,
  `bff/README.md`, `docs/`, `deploy/README.md`, `SECURITY.md`, `CONTRIBUTING.md`, the
  `.env.example` comments and the GitHub templates): full local setup and testing sections, the
  access-policy editor, the enforced role guard, the complete list of proxied routes, and the BFF
  described as built on backendkit.

### Removed

- Internal reports in office formats (security audit, remediation report, assurance review,
  production-readiness report, deployment runbook) left the repository; `.gitignore` now keeps
  root-level `.docx`/`.pdf`/`.xlsx`/`.pptx` files out.

### Fixed

- The README declared an MIT licence with no licence file; the project is Apache-2.0.
- The BFF now reads `BFF_PASSWORD_RESET_RATE` (default 5 per minute). It was declared but never
  loaded, so the two public password-reset posts had no per-IP budget despite the value in the
  env templates. A zero, negative or invalid value falls back to the default.

Changes before this changelog was introduced are in the git history.

[Unreleased]: https://github.com/ovander/oauth2-admin/commits/main
