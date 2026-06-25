# Architecture Decision Records

Short, durable records of the load-bearing decisions behind this SPA. Each ADR
captures the context, the decision, and its consequences so future contributors
understand *why*, not just *what*.

Format: lightweight [MADR](https://adr.github.io/madr/). Status is one of
`Accepted`, `Superseded`, `Deprecated`.

| # | Decision | Status |
|---|---|---|
| [0001](./0001-authorization-code-pkce.md) | Authorization Code + PKCE (delegated login), not password/ROPC | Accepted |
| [0002](./0002-token-storage.md) | In-memory access token + HttpOnly refresh cookie | Accepted |
| [0003](./0003-two-origin-model.md) | Separate OIDC issuer and admin resource-server origins | Accepted |
| [0004](./0004-csp-trusted-types.md) | Canonical, tested CSP + staged Trusted Types rollout | Accepted |
| [0005](./0005-custom-header-csrf.md) | Keep the `X-Requested-By` custom-header CSRF check | Accepted |
| [0006](./0006-error-code-driven-flows.md) | Interceptor-driven `401`/`403` auth flows | Accepted |
