# Contributing to the Socrate admin console

Thank you for your interest. The admin console is the superadmin portal of the Socrate
OAuth 2.1 / OIDC platform: a Vue 3 SPA and a small Go Backend-for-Frontend in `bff/`. The server
it administers is [`ovander/go-oauth2`](https://github.com/ovander/go-oauth2); the BFF runtime
comes from [`ovander/backendkit`](https://github.com/ovander/backendkit). Contributions are
accepted under the project's licence, [Apache-2.0](LICENSE).

## Development setup

Requirements: Node.js 20, and Go for the BFF (the `toolchain` line in `bff/go.mod` downloads
the exact version, 1.27.1). A running Socrate server is needed to sign in; see the README →
Getting Started.

```bash
git clone https://github.com/ovander/oauth2-admin && cd oauth2-admin
npm ci
cp .env.example .env        # leave the API URLs unset for the same-origin BFF setup
npm run dev                 # SPA on Vite
cd bff && go run .          # BFF; configure it from bff/.env.example
```

## Security rules

This console is the privileged surface of the platform, so a few rules are absolute. They are
explained in [SECURITY.md](SECURITY.md).

- **No tokens in the browser.** The SPA never sets an `Authorization` header and never stores a
  token in `localStorage` or `sessionStorage`; the BFF holds the tokens.
- **No XSS sinks**: no `v-html`, `innerHTML`, `eval` or `document.write`. ESLint is a security
  gate and blocks them as errors.
- **The Content Security Policy lives in `src/security/csp.ts`** and is unit-tested; the Caddy
  headers in `deploy/` mirror it. Change both together.
- **The BFF is an allowlist, never an open proxy.** A new upstream route is added explicitly,
  behind the session and CSRF checks.
- Do not turn a fail-closed default into a fail-open one to make something work.

## Tests and checks

Run these before opening a pull request; CI runs the same and all of them are required:

```bash
npm run lint:check                  # ESLint security gate
npx vue-tsc -b && npm run build     # type check + production build
npm run coverage                    # Vitest unit and integration tests
npx playwright test                 # end-to-end (installs Chromium on first run)
./scripts/npm-audit-gate.sh         # fails on a high/critical advisory, or no audit data
cd bff && go vet ./... && go test -race ./...
cd bff && golangci-lint run ./...   # v2.14.0, built with Go 1.27.1
```

- A bug fix comes with a test that fails without it.
- A new view or flow gets a unit test, and an e2e test when it crosses the BFF.

## Pull requests

1. Branch from `main` (`feat/…`, `fix/…`, `chore/…`, `docs/…`).
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
   `chore:`, `docs:`, `ci:`, `test:`).
3. Add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
4. Open the PR with the template filled in, including deploy notes (new BFF environment
   variable, Caddy or CSP change, order with the Socrate server).
5. CI must be green. The maintainer reviews and merges.

## Releases

The maintainer tags releases `vX.Y.Z` on `main` and deploys them with the scripts in `deploy/`
(see [`deploy/README.md`](deploy/README.md)): the SPA and the BFF are built locally and shipped to
the host, so no build toolchain runs in production.

## Security

Please do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
