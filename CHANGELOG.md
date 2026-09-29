# Changelog

All notable changes to the Socrate admin console are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Apache-2.0 licence** (`LICENSE`, and `license` in `package.json`) and the contributor kit:
  `CONTRIBUTING.md`, `CLAUDE.md`, `CODEOWNERS`, issue forms, a pull-request template and this
  changelog.
- `SECURITY.md` now opens with how to report a vulnerability (GitHub private vulnerability
  reporting), the scope and the supported versions; the security-posture content is unchanged.

### Removed

- Internal reports in office formats (security audit, remediation report, assurance review,
  production-readiness report, deployment runbook) left the repository; `.gitignore` now keeps
  root-level `.docx`/`.pdf`/`.xlsx`/`.pptx` files out.

### Fixed

- The README declared an MIT licence with no licence file; the project is Apache-2.0.

Changes before this changelog was introduced are in the git history.
