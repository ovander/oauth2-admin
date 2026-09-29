## What and why

<!-- What this changes and why. Link the issue if there is one ("Closes #…"). -->

## How it was tested

<!-- New or changed tests, and anything checked by hand in the browser. -->

- [ ] `npm run lint:check`
- [ ] `npx vue-tsc -b && npm run build`
- [ ] `npm run coverage`
- [ ] `npx playwright test`
- [ ] `./scripts/npm-audit-gate.sh`
- [ ] `cd bff && go vet ./... && go test -race ./... && golangci-lint run ./...`
- [ ] No token reaches the browser, no new XSS sink, CSP unchanged or changed in both `src/security/csp.ts` and `deploy/`
- [ ] A line is added under `## [Unreleased]` in `CHANGELOG.md`

## Deploy notes

<!-- Delete what does not apply. -->
- New or changed BFF environment variable: <!-- name, default, also in bff/.env.example and deploy/env -->
- Caddy or CSP change: <!-- what, and which file in deploy/ -->
- Order with the Socrate server: <!-- e.g. needs a Socrate release deployed first -->
