# Security headers

The admin SPA must be served with a strict Content Security Policy and a set of hardening
headers. The edge sets them on every response; in the deploy kit that edge is Caddy. The policy
itself is owned in code.

> **Canonical source:** [`src/security/csp.ts`](../src/security/csp.ts): `productionCsp()`,
> `productionCspReportOnly()` and `SECURITY_HEADERS`. It is unit-tested
> (`src/__tests__/unit/csp.spec.ts`), the Vite dev and `vite preview` servers serve these
> headers, and the Playwright test `e2e/security/headers.spec.ts` checks that the served app
> carries them. **The deployed configuration is [`deploy/Caddyfile`](../deploy/Caddyfile)**;
> change it and `csp.ts` in the same pull request.

## The headers

| Header | Value from `csp.ts` |
|---|---|
| `Content-Security-Policy` | `productionCsp()`, see below |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

HSTS is not part of `csp.ts`; the Caddyfile sets
`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.

### Content-Security-Policy

`productionCsp()` returns, for the same-origin BFF deployment (no API origin to add):

```
default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'; object-src 'none'
```

(one line in the header). With `VITE_ADMIN_API_URL` set, that origin is added to `connect-src`.

The production build emits no inline script (one external module script), so `script-src 'self'`
holds without `'unsafe-inline'` or `'unsafe-eval'`. `'unsafe-inline'` remains only in
`style-src`, because PrimeVue and Tailwind inject `<style>` at runtime.

The policy in `deploy/Caddyfile` differs from `productionCsp()` in two places: it uses
`default-src 'self'` instead of `'none'`, and it allows `data:` in `font-src`. Every other
directive is the same.

### Trusted Types, staged

`productionCspReportOnly()` adds `require-trusted-types-for 'script'; trusted-types default` to
the policy above. It makes DOM script-injection sinks (`innerHTML`, `script.src`, …) throw unless
they go through a vetted policy. Because third-party code must be observed in a real browser
first, it is meant to be served as `Content-Security-Policy-Report-Only` next to the enforced
policy. `npm run preview` serves both headers; exercise the app there to surface violations.
Once clean, fold `require-trusted-types-for 'script'` into the enforced header. If a sink
legitimately needs HTML, add a named Trusted Types policy (for example a DOMPurify-backed
`createHTML`) rather than a pass-through default.

`deploy/Caddyfile` does not send the report-only header today.

## Caddy

The site block in [`deploy/Caddyfile`](../deploy/Caddyfile) sets the headers in a `header { … }`
block, removes the `Server` header, routes the BFF paths and serves the SPA with a history-API
fallback:

```caddy
admin.example.com {
	root * /srv/admin/dist

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "geolocation=(), microphone=(), camera=()"
		Cross-Origin-Opener-Policy "same-origin"
		Content-Security-Policy "…"   # see deploy/Caddyfile
		-Server
	}

	@bff path /bff/* /api/admin/* /api/apps/* /api/profile /api/version /api/auth/request-password-reset /api/auth/reset-password
	handle @bff {
		reverse_proxy 127.0.0.1:8091 {
			flush_interval -1
			header_up X-Forwarded-Proto {scheme}
		}
	}

	handle {
		try_files {path} /index.html
		file_server
	}
}
```

This is an outline; copy from `deploy/Caddyfile`, not from here.

## Other reverse proxies

If you put the SPA behind Nginx instead, set the same values with `add_header … always;` for
each header in the table and the CSP above, keep the SPA fallback (`try_files $uri /index.html`),
and proxy the same paths to the BFF with buffering off (`proxy_buffering off;`) so the event
stream is not held back. The BFF trusts `X-Forwarded-For` only from a loopback peer, so the proxy
must run on the same host and overwrite that header with the client address.
