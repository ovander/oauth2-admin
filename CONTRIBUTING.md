# Contributing to the Socrate admin console

Thank you for your interest. The admin console is part of the Socrate suite: it is the
superadmin portal of Socrate, the suite's OAuth 2.1 / OpenID Connect server (`ovander/go-oauth2`,
not public yet), made of a Vue 3 SPA and a small Go Backend-for-Frontend in `bff/` built on
[backendkit](https://github.com/ovander/backendkit). Contributions are accepted under the
project's licence, [Apache-2.0](LICENSE).

## Development setup

Requirements: Node.js 24 (the version in `.nvmrc`, which CI uses), and Go for the BFF (the
`toolchain` line in `bff/go.mod` makes the Go command download the exact version, 1.27.1).
Signing in needs a reachable Socrate server with a confidential OAuth client registered for the
BFF; the README's [Getting started](README.md#getting-started) walks through it.

```bash
git clone https://github.com/ovander/oauth2-admin && cd oauth2-admin
npm ci
cp .env.example .env.local    # optional: the defaults suit the dev proxy; git ignores .env.local
cp bff/.env.example bff/.env  # set the client id and secret, and the local values from the README

# terminal 1: the BFF on 127.0.0.1:8091
cd bff && set -a && . ./.env && set +a && go run .

# terminal 2: the SPA on http://localhost:5173
npm run dev
```

The unit, end-to-end and BFF tests do not need a Socrate server: they run against mocks.

## Design rules

This console is the privileged surface of the platform, so a few rules are absolute. They are
explained in [SECURITY.md](SECURITY.md).

- **No tokens in the browser.** The SPA never sets an `Authorization` header and never stores a
  token in `localStorage` or `sessionStorage`; the BFF holds the tokens.
- **No XSS sinks**: no `v-html`, `innerHTML`, `eval` or `document.write`. ESLint is a security
  gate and blocks them as errors.
- **The Content Security Policy lives in `src/security/csp.ts`** and is unit-tested; the Caddy
  headers in `deploy/` mirror it. Change both together.
- **The BFF is an allowlist, never an open proxy.** A new upstream route is added explicitly,
  behind the session and CSRF checks, in `bff/app.go` and in `deploy/Caddyfile`.
- Do not turn a fail-closed default into a fail-open one to make something work.

The layout of the repository is described in the README's
[Project structure](README.md#project-structure).

## Tests and checks

Run these before opening a pull request; they are the same checks as CI, and all of them are
required:

```bash
npm run lint:check                  # ESLint security gate
npx vue-tsc -b && npm run build     # type check + production build
npm run coverage                    # Vitest unit and integration tests, coverage thresholds
npx playwright test                 # end-to-end (run `npx playwright install chromium` once)
./scripts/npm-audit-gate.sh         # fails on a high/critical advisory, or no audit data
cd bff && go vet ./... && go test -race ./...
cd bff && golangci-lint run ./...   # v2.14.0, built with Go 1.27.1
```

- A new view or flow gets a unit test, and an e2e test when it crosses the BFF.

## Pull requests

1. Branch from `main` (`feat/…`, `fix/…`, `chore/…`, `ci/…`, `docs/…`).
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
   `chore:`, `docs:`, `ci:`, `test:`).
3. Add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
4. A bug fix comes with a test that fails without it.
5. Open the PR with the template filled in, including deploy notes (new BFF environment
   variable, Caddy or CSP change, order with the Socrate server).
6. CI must be green. The maintainer reviews and merges.

## Releases

The maintainer tags releases `vX.Y.Z` on `main`, moving the `[Unreleased]` section of the
changelog under the new version, and deploys them with the scripts in `deploy/` (see
[`deploy/README.md`](deploy/README.md)): the SPA and the BFF are built locally and shipped to
the host, so no build toolchain runs in production.

## Security

Please do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
