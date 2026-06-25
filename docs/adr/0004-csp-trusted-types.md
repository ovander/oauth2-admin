# ADR-0004: Canonical, tested CSP + staged Trusted Types rollout

**Status:** Accepted

## Context

A static SPA can't set its own production response headers, so CSP was previously
only prose in docs + a dev-server header — no single source of truth, no test
gate, and no Trusted Types. That risks drift between what's documented and what's
served.

## Decision

- Own the policy in code: `src/security/csp.ts` exports `productionCsp()`
  (strict: `default-src 'none'`; `script-src 'self'` with no `unsafe-inline`/
  `unsafe-eval` — the build emits no inline scripts; `object-src`/
  `frame-ancestors 'none'`; `base-uri`/`form-action 'self'`) and
  `SECURITY_HEADERS`.
- **Unit-test the policy** as a deploy gate (`csp.spec.ts`) so a weakened
  directive fails CI; the dev and `vite preview` servers serve the same headers.
- Ship **Trusted Types** (`require-trusted-types-for 'script'`) as a
  **Report-Only** rollout (`productionCspReportOnly()`) — enforcement needs
  real-browser violation testing (third-party widgets), so observe in staging
  first, then promote.

## Consequences

- Local == production headers; regressions are caught by tests.
- The reverse proxy must still emit the canonical headers in production
  (generated from the same module — see `docs/security-headers.md`).
- Trusted Types enforcement is a follow-up gated on a clean staging soak; the
  promotion path and a DOMPurify-backed policy recommendation are documented.
