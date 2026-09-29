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

`deploy/Caddyfile` sends this policy verbatim; `csp.spec.ts` fails if its
`Content-Security-Policy` line, or one of the hardening headers, drifts from `csp.ts`. The
built app needs nothing more: loaded under this policy in Chromium (sign-in, password reset,
dashboard, applications, users, security, access policy, logs with a CSV export, settings), it
reports no violation, and the PrimeIcons font loads from `/assets/` (the build emits no `data:`
font).

### Trusted Types, staged

`productionCspReportOnly()` adds two directives to the policy above:

```
require-trusted-types-for 'script'; trusted-types vue default
```

`require-trusted-types-for 'script'` makes the DOM injection sinks (`innerHTML`,
`insertAdjacentHTML`, `script.src`, `script.textContent`, …) refuse a plain string: a value must
come from a Trusted Types policy. `trusted-types` lists the only policy names that may be
created, once each (no `'allow-duplicates'`). The two are served as
`Content-Security-Policy-Report-Only` next to the enforced policy until a real browser has shown
them clean; `npm run preview` serves both headers. The allowed names:

- **`vue`**: Vue's runtime-dom creates it to insert compiled static template content. It does not
  sanitise, and `v-html` or an `innerHTML` binding would go through it too; the ESLint gate that
  bans them is what keeps that path closed.
- **`default`**: created by the app itself in `src/main.ts`, before the app is created
  (`src/security/trustedTypes.ts`). The browser routes a plain string written to a sink through
  it. It is rejecting, not a pass-through: it returns the empty string unchanged and refuses
  every other HTML, script and script-URL value, so the sink throws and the violation is
  reported. It exists because PrimeVue's `v-tooltip` clears each new tooltip element with
  `innerHTML = ''` before adding the text as a text node.

No other bundled library creates a policy (`createPolicy(` and `trustedTypes` appear only in
Vue's runtime-dom). PrimeVue's other raw `innerHTML` writes build `<style>` blocks for the
`breakpoints` of Dialog, Popover and Toast, a multi-month DatePicker's `responsiveOptions`, a
Paginator `template` object, DataTable column resizing, and the OrderList, PickList and
TreeTable components; the console uses none of them.
Chart.js draws on a canvas. If a sink ever needs real HTML, give it a named, sanitising policy
(for example DOMPurify-backed), added to `TRUSTED_TYPES_POLICIES` in `csp.ts`; do not widen
`default`.

`trusted-types default` alone, as the policy stood before, refused Vue's policy: every page
reported it, and enforced, Vue's static-content `innerHTML` threw and left pages blank.

**Evidence.** The production build under `vite preview`, in Chromium with `/bff/session` mocked
as an authenticated super_admin and `/api/**` mocked (the shapes of
`e2e/fixtures/api-mocks.ts`), collecting `securitypolicyviolation` events and console errors on
21 routes: sign-in, forgot and reset password, dashboard (with the login-trends chart),
applications list, new and detail, users list and detail, the security dashboard, events,
sessions, blocked IPs, alerts, reports and access policy, admin logs (with the date picker
open), settings, profile, 403 and a 404. On the applications pages a tooltip was shown and on
the application detail page the delete dialog was opened and confirmed, which raised a toast.

| Trusted Types directives | Served as | Result |
|---|---|---|
| `trusted-types default` (before) | Report-Only | one violation on every route (policy `vue` refused), plus one per tooltip |
| `trusted-types default` (before) | enforced | every page blank: `insertStaticContent` throws |
| `trusted-types vue` | enforced | pages render; each tooltip throws (`innerHTML = ''`) |
| `trusted-types vue default` (now) | Report-Only | no violation, no console error, on all 21 routes |
| `trusted-types vue default` (now) | enforced | no violation, no console error, every page renders, tooltip, dialog and toast work |

Under enforcement a probe confirmed that the policy still bites: `innerHTML = ''` passes,
`innerHTML` with markup, `insertAdjacentHTML`, `script.src` and `script.textContent` throw, and
creating another policy, a second `default` or a second `vue` is refused.

**Reporting endpoint.** Neither Socrate (`go-oauth2`) nor the admin BFF has a CSP report
endpoint today, so the policy names none, and `deploy/Caddyfile` does not send the Report-Only
header yet (`csp.spec.ts` checks that it does not). A header with nowhere to report only shows up
in the console of the admin who hits it. The recommended endpoint is a small BFF route,
`POST /bff/csp-report`, rather than a third-party collector: Caddy already routes `/bff/*` to
the BFF, the BFF already has per-IP budgets and trusts `X-Forwarded-For` only from loopback, and
reports then stay on the host instead of sending admin-console URLs to another party. It is its
own change, with these constraints:

- Pre-authentication and without CSRF: browsers send reports without the session cookie and
  cannot add `X-CSRF-Token`. The route therefore only logs; it never touches the session and is
  never proxied upstream. It is the one unsafe method exempt from the CSRF check, and says so.
- Accepts `application/csp-report` (`report-uri`) and `application/reports+json` (`report-to`)
  only, a body capped with `http.MaxBytesReader` (for example 16 KiB), and a per-IP budget with
  the existing `rateLimiter`; answers `204`, `413` or `429`.
- Logs a few fields, each truncated: disposition, effective directive, blocked URI, sample,
  document path. Query strings are dropped: the reset-password page carries its token in the
  query.

Rollout steps:

1. This change: the directives above and the app's `default` policy. `npm run preview` is clean.
2. BFF: add `POST /bff/csp-report` as described, with tests (size cap, content types, rate
   limit, no session or upstream access, query stripped from the logged URL).
3. `csp.ts` and `deploy/Caddyfile` together: `productionCspReportOnly()` gains
   `report-uri /bff/csp-report; report-to csp`, the edge sends a `Reporting-Endpoints:
   csp="/bff/csp-report"` header (both, because browser support for `report-to` still
   varies), and Caddy sends the Report-Only header; `csp.spec.ts` then checks that header
   against `productionCspReportOnly()` instead of its absence.
4. Soak: run the console with the Report-Only header for a few weeks of normal admin use, and
   read the BFF log for reports.
5. Once no report comes in, fold `require-trusted-types-for 'script'; trusted-types vue default`
   into `productionCsp()` and the Caddyfile's enforced header (keeping the reporting directives),
   and drop the Report-Only header.

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
		Content-Security-Policy "…"   # productionCsp(), verbatim; see deploy/Caddyfile
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
