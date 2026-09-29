# CLAUDE.md — oauth2-admin

Standing instructions for Claude Code in this repository. Read this file, `CONTRIBUTING.md` and
`SECURITY.md` before any change. The Socrate server and its admin API live in
`ovander/go-oauth2`; the BFF runtime (sessions, CSRF, PKCE, proxy) comes from
`ovander/backendkit`; the sibling monitoring console is `ovander/oauth2-monitoring`.

## Project in one paragraph

The Socrate superadmin portal: a Vue 3 + PrimeVue 4 + Tailwind 4 SPA (TypeScript, Pinia, Vue
Router) and a Go Backend-for-Frontend in `bff/`. The BFF is the confidential OAuth client: it runs
Authorization Code + PKCE server-side, keeps the tokens in a server-side session and gives the
browser only an opaque `__Host-` cookie. It proxies an explicit allowlist (`/bff/*`,
`/api/admin/*`, `/api/apps/*`, `/api/profile`, `GET /api/version`, the public password-reset posts)
to the loopback-only admin API, injecting the bearer. Caddy is the only public listener.

## Sources of truth, in order

1. The code. Read it before proposing changes; do not describe code you have not opened.
2. `SECURITY.md` — the controls the code must keep enforcing, and the deployment requirements.
3. `docs/architecture.md`, `bff/README.md` and `deploy/README.md`.

## Hard rules

- **No tokens in the browser.** No `Authorization` header from the SPA, nothing in
  `localStorage`/`sessionStorage`; auth state comes from `GET /bff/session`.
- **No XSS sinks.** No `v-html`, `innerHTML`/`outerHTML`/`insertAdjacentHTML`, `eval`,
  `new Function`, `document.write`, `javascript:` URLs. ESLint enforces it; do not disable the rule.
- **CSP.** `src/security/csp.ts` is canonical and unit-tested; the Caddy headers in `deploy/`
  mirror it. Change both in the same PR.
- **BFF allowlist.** A new upstream path is added explicitly, behind the session and CSRF checks;
  never add a catch-all proxy route. Unsafe methods keep requiring `X-CSRF-Token`.
- **Fail closed.** No valid session ⇒ 401. Do not enable `BFF_ALLOW_PASSTHROUGH` or
  `BFF_PHASE1_PASSTHROUGH` outside a documented migration step.
- **Never weaken a gate** to get green: no skipped or deleted tests, no `eslint-disable` or
  `//nolint` without a one-line reason, no `continue-on-error`, no required check removed, no
  lowered `npm audit` level.
- **Secrets** never enter the repository: no `.env` (only `.env.example`), keys or client
  secrets. The BFF secret lives in `/etc/socrate/admin-bff.env` on the host.
- **Scope.** One change per PR; do not widen a PR with unrelated fixes (open a separate one).

## Local gate (the same checks as CI)

```bash
npm run lint:check
npx vue-tsc -b && npm run build
npm run coverage
npx playwright test
./scripts/npm-audit-gate.sh
cd bff && go vet ./... && go test -race ./... && golangci-lint run ./...
```

## Git workflow

- Branch from `main`: `feat/…`, `fix/…`, `chore/…`, `ci/…`, `docs/…`. Conventional Commits.
- Open a PR; never push to `main`, never force-push a shared branch, never merge with red CI.
  The owner merges.
- Each PR adds a line under `## [Unreleased]` in `CHANGELOG.md`, and says in its body what it
  changes, how it was tested, and any deploy note (BFF environment variable, Caddy/CSP change,
  order with the Socrate server).

## Releases and deploys (the owner runs them)

A release is a tag `vX.Y.Z` on `main`, with the `[Unreleased]` changelog section moved under the
new version. Artifacts are built locally and shipped with `deploy/scripts/push.sh`. Do not tag or
deploy unless asked.
