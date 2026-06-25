# Contributing

Thanks for working on the Socrate Superadmin Portal. This is a **Tier-0** admin
surface — the bar is the same as the backend: it must never become the weak link
or a vector into the server. Please read [`SECURITY.md`](./SECURITY.md) and
[`ARCHITECTURE.md`](./ARCHITECTURE.md) before substantial changes.

## Setup

See [`docs/getting-started.md`](./docs/getting-started.md). TL;DR:

```bash
npm install
cp .env.example .env.local   # configure the two origins
npm run dev
```

## Quality gates (must pass before a PR is merged)

```bash
npm run security:check   # npm audit (high+) + ESLint security gate
npm run build            # vue-tsc type-check + production build (no TS errors)
npm run test:run         # unit + integration tests (Vitest)
npm run coverage         # enforces the 80% threshold on covered modules
```

CI runs lint + type-check + build, the Vitest suite, and the Playwright e2e
suite on every PR. All must be green.

## Conventions

- **TypeScript, strict.** No `any` in new security-critical code. `noUnusedLocals`
  is on — keep imports tight.
- **ESLint is a security gate, not a style linter.** It blocks `eval`,
  `new Function`, `javascript:` URLs, `innerHTML`/`outerHTML`/`insertAdjacentHTML`
  assignment, and Vue `v-html`. Don't disable these rules.
- **Tokens:** access tokens live in memory only (`tokenStore`), never in
  `localStorage`/`sessionStorage`. The refresh token is an HttpOnly cookie — JS
  must never read it.
- **Two origins:** OAuth/issuer calls go through `oauth.ts` / `issuerApi`
  (`VITE_OIDC_ISSUER`); admin data goes through `api` (`VITE_ADMIN_API_URL`).
  Don't hardcode origins — resolve via `utils/secureConfig`.
- **Errors drive flows:** the `api.ts` interceptor centralises `401` refresh and
  the `403 elevation_required` / `password_change_required` challenges. Add new
  cross-cutting auth behavior there, not per-view.
- **Comments explain *why*.** Match the surrounding density — security decisions
  carry a short rationale and, where relevant, the RFC / finding id.

## Tests

- **Unit / integration:** Vitest + `@vue/test-utils`, with **MSW** mocking HTTP
  at the network layer (`src/__tests__/`). New security-critical modules need
  tests and stay within the coverage gate.
- **E2E:** Playwright (`e2e/`), run against the dev server in CI.
- Prefer asserting **behavior and security properties** (e.g. "state mismatch is
  rejected", "no token in storage") over implementation details.

## Branching & PRs

- Branch off `main`; keep PRs focused (one concern).
- Reference the architecture/security implication in the PR description.
- Update the docs in the same PR when you change behavior:
  `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `docs/`, `.env.example`,
  `CHANGELOG.md`, and a new `docs/adr/` entry for a load-bearing decision.
- Never weaken a documented control to make tooling quieter — fix the root cause.

## Reporting security issues

Report suspected vulnerabilities privately to the Socrate maintainers. Do not
open a public issue with exploit detail.
