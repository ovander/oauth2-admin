# Security headers

The admin SPA must be served with a strict Content Security Policy and a set of hardening
headers. The edge sets them on every response; in the deploy kit that edge is Caddy. The policy
itself is owned in code.

> **Canonical source:** [`src/security/csp.ts`](../src/security/csp.ts): `productionCsp()`,
> `productionCspReportOnly()`, `REPORTING_ENDPOINTS` and `SECURITY_HEADERS`. It is unit-tested
> (`src/__tests__/unit/csp.spec.ts`), the Vite dev and `vite preview` servers serve these
> headers, and the Playwright test `e2e/security/headers.spec.ts` checks that the served app
> carries them. **The deployed configuration is [`deploy/Caddyfile`](../deploy/Caddyfile)**;
> change it and `csp.ts` in the same pull request.

## The headers

| Header | Value from `csp.ts` |
|---|---|
| `Content-Security-Policy` | `productionCsp()`, see below |
| `Content-Security-Policy-Report-Only` | `productionCspReportOnly()`, see [Trusted Types, staged](#trusted-types-staged) |
| `Reporting-Endpoints` | `REPORTING_ENDPOINTS`: `csp="/bff/csp-report"` |
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

`productionCspReportOnly()` adds four directives to the policy above:

```
require-trusted-types-for 'script'; trusted-types vue default; report-uri /bff/csp-report;
report-to csp
```

(one line in the header). The first two are the Trusted Types rollout; the last two send each
violation to the admin BFF (see [Reports](#reports)).

`require-trusted-types-for 'script'` makes the DOM injection sinks (`innerHTML`,
`insertAdjacentHTML`, `script.src`, `script.textContent`, …) refuse a plain string: a value must
come from a Trusted Types policy. `trusted-types` lists the only policy names that may be
created, once each (no `'allow-duplicates'`). They are served as
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

**Reports.** The Report-Only policy names the admin BFF's `POST /bff/csp-report` twice:
`report-to csp`, with the `Reporting-Endpoints: csp="/bff/csp-report"` header that defines the
`csp` group (Reporting API, `application/reports+json`), and `report-uri /bff/csp-report` for a
browser without the Reporting API (`application/csp-report`). A browser that supports
`report-to` ignores `report-uri`. Checked with Chromium 141 through `deploy/Caddyfile` over
HTTPS: an `innerHTML` assignment produced a `POST /bff/csp-report` with
`Content-Type: application/reports+json` within about a second, and the BFF logged it. Over
plain `http://localhost` (`vite preview`) the same browser delivered no report in two minutes, so
there read the console or listen for `securitypolicyviolation`. The endpoint is on the console's own origin, Caddy's `/bff/*` route
already reaches it, and reports stay on the host instead of going to a third-party collector.

The route works without a session and without `X-CSRF-Token`, because browsers send reports
without cookies and cannot add a header. That is safe because it only logs: it never reads or
touches a session, never calls an upstream and changes no state, so a forged report can at worst
add log lines. Those are bounded: a per-IP budget (`BFF_CSP_REPORT_RATE`, default 30 a minute,
`X-Forwarded-For` trusted only from loopback), an 8 KiB body cap, and at most 10 lines per
request. It answers `204`; `405` to another method, `415` to another content type, `413` above
8 KiB, `400` to malformed JSON, and `429` over budget, without reading the body.

Each violation is one line in the BFF log, for example:

```
csp-report: disposition="report" directive="require-trusted-types-for" blocked="trusted-types-sink" document="https://admin.example.com/reset-password" source="https://admin.example.com/assets/index.js" line=12 column=34 sink="Element innerHTML"
```

Query strings, fragments and userinfo are dropped from every URL-like field (the
reset-password page carries its token in the query); keywords such as `inline`, `eval` or
`trusted-types-sink` are kept as they are. Each field is truncated to 256 bytes and stripped of
control characters. The policy text, the referrer, the code sample (for a Trusted Types
violation only the sink name before `|` is kept), cookies, headers and the raw body are never
logged. On the host, read them with:

```bash
journalctl -u socrate-admin-bff --since "7 days ago" | grep 'csp-report:'
```

The enforced `productionCsp()` names no endpoint. Its directives have held with no violation on
every route (see above), and this change stays focused on the Trusted Types rollout; making the
enforced policy report too is a separate decision, best taken when the Trusted Types directives
are folded into it.

Rollout steps:

1. Done: the directives above and the app's `default` policy. `npm run preview` is clean.
2. Done: `POST /bff/csp-report` in the BFF (`bff/cspreport.go`), with tests for the size cap,
   the content types, the rate limit, unauthenticated access without upstream access, and the
   query and fragment stripped from the logged URLs.
3. Done: `productionCspReportOnly()` carries `report-uri /bff/csp-report; report-to csp`,
   `csp.ts` exports `REPORTING_ENDPOINTS`, and `deploy/Caddyfile` sends both
   `Reporting-Endpoints` and `Content-Security-Policy-Report-Only`; `csp.spec.ts` checks that
   both equal `csp.ts`. Deploy the BFF first, then the Caddy site, so the first report finds its
   endpoint.
4. Next, soak: run the console with the Report-Only header for a few weeks of normal admin use,
   and read the BFF log for `csp-report:` lines. A report names the directive, the sink and the
   source line to fix; a fix that needs real HTML gets a named, sanitising policy, not a wider
   `default`.
5. Then enforce: once no report comes in, fold `require-trusted-types-for 'script';
   trusted-types vue default` into `productionCsp()` and the Caddyfile's enforced header, decide
   there whether the enforced policy keeps reporting, and drop the Report-Only header.

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
		Reporting-Endpoints `csp="/bff/csp-report"`
		Content-Security-Policy-Report-Only "…"   # productionCspReportOnly(), verbatim
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
