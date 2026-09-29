package main

import (
	"bytes"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"unicode/utf8"
)

// ── POST /bff/csp-report ─────────────────────────────────────────────────────

// syncBuffer is a goroutine-safe log sink.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// lines returns the non-empty log lines.
func (b *syncBuffer) lines() []string {
	var out []string
	for _, l := range strings.Split(b.String(), "\n") {
		if l != "" {
			out = append(out, l)
		}
	}
	return out
}

// captureLog redirects the standard logger (the BFF's logger) for one test.
func captureLog(t *testing.T) *syncBuffer {
	t.Helper()
	buf := &syncBuffer{}
	prevOut, prevFlags := log.Writer(), log.Flags()
	log.SetOutput(buf)
	log.SetFlags(0)
	t.Cleanup(func() {
		log.SetOutput(prevOut)
		log.SetFlags(prevFlags)
	})
	return buf
}

// cspReportServer builds the full handler from LoadConfig output (sessions on,
// as in production), with upstreams that fail the test if they are reached: a
// report is never forwarded.
func cspReportServer(t *testing.T) http.Handler {
	t.Helper()
	cspReportEnv(t)
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	return NewServer(cfg)
}

// cspReportEnv sets a Phase-2 environment whose upstreams fail the test if
// they are reached.
func cspReportEnv(t *testing.T) {
	t.Helper()
	unreachable := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		t.Errorf("upstream reached for %s %s", r.Method, r.URL.Path)
	}))
	t.Cleanup(unreachable.Close)
	phase2Env(t)
	t.Setenv("BFF_ADMIN_UPSTREAM", unreachable.URL)
	t.Setenv("BFF_OAUTH_UPSTREAM", unreachable.URL)
}

func postReport(h http.Handler, target, contentType, body string, mod ...func(*http.Request)) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, target, strings.NewReader(body))
	req.RemoteAddr = "198.51.100.20:4000"
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for _, m := range mod {
		m(req)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

// A legacy report-uri body from the reset-password page, whose token rides in
// the query: every URL-like field carries a SECRET that must not be logged.
const legacyReport = `{"csp-report":{
	"document-uri":"https://admin.example.com/reset-password?token=SECRET#x",
	"referrer":"https://admin.example.com/?r=SECRET",
	"violated-directive":"require-trusted-types-for",
	"effective-directive":"require-trusted-types-for",
	"original-policy":"default-src 'none'; report-uri /bff/csp-report?SECRET",
	"disposition":"report",
	"blocked-uri":"trusted-types-sink",
	"line-number":12,
	"column-number":34,
	"source-file":"https://admin.example.com/assets/index.abc.js?v=SECRET#frag",
	"status-code":200,
	"script-sample":"Element innerHTML|<b>SECRET</b>"}}`

func TestCSPReport_LegacyReportURI(t *testing.T) {
	logs := captureLog(t)
	h := cspReportServer(t)

	rr := postReport(h, "/bff/csp-report", "application/csp-report", legacyReport)
	if rr.Code != http.StatusNoContent || rr.Body.Len() != 0 {
		t.Fatalf("status %d body %q, want 204 with no body", rr.Code, rr.Body.String())
	}
	lines := logs.lines()
	if len(lines) != 1 {
		t.Fatalf("want exactly one log line, got %q", lines)
	}
	for _, want := range []string{
		`csp-report:`,
		`disposition="report"`,
		`directive="require-trusted-types-for"`,
		`blocked="trusted-types-sink"`, // a keyword, kept as is
		`document="https://admin.example.com/reset-password"`,
		`source="https://admin.example.com/assets/index.abc.js"`,
		`line=12`,
		`column=34`,
		`sink="Element innerHTML"`, // the sink name only, never the value
	} {
		if !strings.Contains(lines[0], want) {
			t.Errorf("log line lacks %s:\n%s", want, lines[0])
		}
	}
	if strings.Contains(logs.String(), "SECRET") {
		t.Fatalf("a query string, fragment, policy or sample reached the log:\n%s", logs.String())
	}
}

func TestCSPReport_ReportingAPI(t *testing.T) {
	logs := captureLog(t)
	h := cspReportServer(t)

	body := `[
	{"type":"csp-violation","age":10,"url":"https://admin.example.com/reset-password?token=SECRET","user_agent":"UA",
	 "body":{"documentURL":"https://admin.example.com/reset-password?token=SECRET#x","referrer":"",
	  "blockedURL":"https://cdn.example.net/x.js?k=SECRET#y","effectiveDirective":"script-src-elem",
	  "originalPolicy":"SECRET","sourceFile":"https://admin.example.com/assets/app.js?SECRET",
	  "sample":"SECRET","disposition":"enforce","statusCode":200,"lineNumber":7,"columnNumber":3}},
	{"type":"csp-violation","url":"https://admin.example.com/users#SECRET",
	 "body":{"documentURL":"https://admin.example.com/users?page=SECRET","blockedURL":"inline",
	  "effectiveDirective":"style-src-attr","disposition":"report"}},
	{"type":"deprecation","url":"https://admin.example.com/","body":{"id":"x","message":"not a CSP report"}}
]`
	rr := postReport(h, "/bff/csp-report", "application/reports+json", body)
	if rr.Code != http.StatusNoContent || rr.Body.Len() != 0 {
		t.Fatalf("status %d body %q, want 204 with no body", rr.Code, rr.Body.String())
	}
	lines := logs.lines()
	if len(lines) != 2 {
		t.Fatalf("want one line per csp-violation (2), got %d:\n%s", len(lines), logs.String())
	}
	for _, want := range []string{
		`disposition="enforce"`, `directive="script-src-elem"`,
		`blocked="https://cdn.example.net/x.js"`,
		`document="https://admin.example.com/reset-password"`,
		`source="https://admin.example.com/assets/app.js"`, `line=7`, `column=3`,
	} {
		if !strings.Contains(lines[0], want) {
			t.Errorf("first line lacks %s:\n%s", want, lines[0])
		}
	}
	if strings.Contains(lines[0], "sink=") {
		t.Errorf("a non-Trusted-Types sample was logged: %s", lines[0])
	}
	for _, want := range []string{
		`disposition="report"`, `directive="style-src-attr"`, `blocked="inline"`,
		`document="https://admin.example.com/users"`,
	} {
		if !strings.Contains(lines[1], want) {
			t.Errorf("second line lacks %s:\n%s", want, lines[1])
		}
	}
	if strings.Contains(logs.String(), "SECRET") || strings.Contains(logs.String(), "deprecation") {
		t.Fatalf("secret or non-CSP report reached the log:\n%s", logs.String())
	}
}

func TestCSPReport_CapsViolationsLoggedPerRequest(t *testing.T) {
	logs := captureLog(t)
	h := cspReportServer(t)

	var reports []string
	for i := 0; i < 15; i++ {
		reports = append(reports, fmt.Sprintf(`{"type":"csp-violation","body":{"blockedURL":"inline","effectiveDirective":"script-src-elem","documentURL":"https://admin.example.com/p%d"}}`, i))
	}
	rr := postReport(h, "/bff/csp-report", "application/reports+json", "["+strings.Join(reports, ",")+"]")
	if rr.Code != http.StatusNoContent {
		t.Fatalf("status %d, want 204", rr.Code)
	}
	lines := logs.lines()
	if len(lines) != cspReportMaxLogged+1 {
		t.Fatalf("want %d violation lines + 1 summary, got %d:\n%s", cspReportMaxLogged, len(lines), logs.String())
	}
	if !strings.Contains(lines[cspReportMaxLogged], "5 more violation(s)") {
		t.Errorf("summary line = %q", lines[cspReportMaxLogged])
	}
}

func TestCSPReport_LogFieldsAreSanitisedAndTruncated(t *testing.T) {
	logs := captureLog(t)
	h := cspReportServer(t)

	long := strings.Repeat("é", 400) // 800 bytes of two-byte runes
	body := `{"csp-report":{"blocked-uri":"inline\nFAKE csp-report: forged\r\u0000\u2028",` +
		`"effective-directive":"` + long + `","document-uri":"https://admin.example.com/` + long + `?q=SECRET"}}`
	if rr := postReport(h, "/bff/csp-report", "application/csp-report", body); rr.Code != http.StatusNoContent {
		t.Fatalf("status %d, want 204", rr.Code)
	}
	lines := logs.lines()
	if len(lines) != 1 {
		t.Fatalf("control characters split the log line: %q", lines)
	}
	if !strings.Contains(lines[0], `blocked="inlineFAKE csp-report: forged"`) {
		t.Errorf("control characters not dropped: %s", lines[0])
	}
	if got := sanitizeLogField(long); len(got) != cspReportMaxField || !utf8.ValidString(got) {
		t.Errorf("sanitizeLogField: %d bytes, valid UTF-8 %v; want %d bytes cut on a rune boundary", len(got), utf8.ValidString(got), cspReportMaxField)
	}
	if got := sanitizeLogField("a" + long); len(got) != cspReportMaxField-1 || !utf8.ValidString(got) {
		t.Errorf("odd offset: %d bytes, valid UTF-8 %v; want %d bytes (no split rune)", len(got), utf8.ValidString(got), cspReportMaxField-1)
	}
	if !utf8.ValidString(lines[0]) || len(lines[0]) > 3*cspReportMaxField+200 {
		t.Errorf("log line not truncated: %d bytes", len(lines[0]))
	}
	if strings.Contains(lines[0], "SECRET") {
		t.Errorf("query reached the log: %s", lines[0])
	}
}

func TestStripQueryAndFragment(t *testing.T) {
	for in, want := range map[string]string{
		"https://admin.example.com/reset-password?token=SECRET#x": "https://admin.example.com/reset-password",
		"https://user:pw@admin.example.com/a?b#c":                 "https://admin.example.com/a",
		"https://admin.example.com/a?":                            "https://admin.example.com/a",
		"inline":                                                  "inline",
		"eval":                                                    "eval",
		"trusted-types-sink":                                      "trusted-types-sink",
		"data":                                                    "data",
		"/relative/path?x=1#y":                                    "/relative/path",
		"":                                                        "",
	} {
		if got := stripQueryAndFragment(in); got != want {
			t.Errorf("stripQueryAndFragment(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCSPReport_MediaTypes(t *testing.T) {
	logs := captureLog(t)
	h := cspReportServer(t)

	accepted := []string{
		"application/csp-report",
		"application/csp-report; charset=utf-8", // parameters are ignored
		"Application/CSP-Report",
	}
	for _, ct := range accepted {
		if rr := postReport(h, "/bff/csp-report", ct, legacyReport); rr.Code != http.StatusNoContent {
			t.Errorf("Content-Type %q: status %d, want 204", ct, rr.Code)
		}
	}
	if rr := postReport(h, "/bff/csp-report", "application/reports+json; charset=utf-8", "[]"); rr.Code != http.StatusNoContent {
		t.Errorf("reports+json with parameters: status %d, want 204", rr.Code)
	}
	for _, ct := range []string{"", "application/json", "text/plain", "application/x-www-form-urlencoded", "application/csp-report;;", "application/csp-reportx"} {
		if rr := postReport(h, "/bff/csp-report", ct, legacyReport); rr.Code != http.StatusUnsupportedMediaType {
			t.Errorf("Content-Type %q: status %d, want 415", ct, rr.Code)
		}
	}
	if n := len(logs.lines()); n != len(accepted) {
		t.Errorf("logged %d lines, want %d (refused bodies are not logged)", n, len(accepted))
	}
}

func TestCSPReport_Oversize(t *testing.T) {
	logs := captureLog(t)
	h := cspReportServer(t)

	big := `{"csp-report":{"blocked-uri":"inline","document-uri":"https://admin.example.com/` + strings.Repeat("a", cspReportMaxBody) + `"}}`
	if rr := postReport(h, "/bff/csp-report", "application/csp-report", big); rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("%d-byte body: status %d, want 413", len(big), rr.Code)
	}
	if rr := postReport(h, "/bff/csp-report", "application/reports+json", "["+strings.Repeat(" ", cspReportMaxBody)+"]"); rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize reports+json: status %d, want 413", rr.Code)
	}
	// Exactly at the cap is still accepted.
	pad := cspReportMaxBody - len(`[]`)
	if rr := postReport(h, "/bff/csp-report", "application/reports+json", "["+strings.Repeat(" ", pad)+"]"); rr.Code != http.StatusNoContent {
		t.Fatalf("body of exactly %d bytes: status %d, want 204", cspReportMaxBody, rr.Code)
	}
	if s := logs.String(); s != "" {
		t.Errorf("an oversize body was logged: %q", s)
	}
}

func TestCSPReport_MalformedJSON(t *testing.T) {
	h := cspReportServer(t)
	for _, c := range []struct{ ct, body string }{
		{"application/csp-report", `{"csp-report":`},
		{"application/csp-report", ``},
		{"application/csp-report", `{}`},                   // no csp-report member
		{"application/csp-report", `[]`},                   // not an object
		{"application/csp-report", `{"csp-report":{}} {}`}, // trailing data
		{"application/csp-report", `{"csp-report":{"line-number":"twelve"}}`},
		{"application/reports+json", `{"type":"csp-violation"}`}, // not an array
		{"application/reports+json", `[{"type":`},
		{"application/reports+json", `not json`},
	} {
		if rr := postReport(h, "/bff/csp-report", c.ct, c.body); rr.Code != http.StatusBadRequest {
			t.Errorf("%s %q: status %d, want 400", c.ct, c.body, rr.Code)
		}
	}
}

func TestCSPReport_OtherMethodsAre405(t *testing.T) {
	h := cspReportServer(t)
	for _, m := range []string{http.MethodGet, http.MethodHead, http.MethodPut, http.MethodDelete, http.MethodPatch, http.MethodOptions} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(m, "/bff/csp-report", strings.NewReader(legacyReport)))
		if rr.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s: status %d, want 405", m, rr.Code)
		}
		if got := rr.Header().Get("Allow"); got != http.MethodPost {
			t.Errorf("%s: Allow = %q, want POST", m, got)
		}
	}
}

func TestCSPReport_NonCanonicalPathsAre404(t *testing.T) {
	logs := captureLog(t)
	h := cspReportServer(t)
	for _, target := range []string{
		"/bff/csp-report/",
		"/bff//csp-report",
		"/bff/./csp-report",
		"/bff/csp-report/../x",
		"/bff/x/../csp-report",
		"/bff%2fcsp-report",
		"/bff%2Fcsp-report",
		"/bff/csp-report%2f",
		"/bff/%2e/csp-report",
		"/bff/csp-report/extra",
	} {
		if rr := postReport(h, target, "application/csp-report", legacyReport); rr.Code != http.StatusNotFound {
			t.Errorf("POST %s: status %d, want 404", target, rr.Code)
		}
	}
	if s := logs.String(); s != "" {
		t.Errorf("a non-canonical path was logged: %q", s)
	}
}

// Browsers send reports without the session cookie and cannot add
// X-CSRF-Token: the route must answer 204 without either, with sessions on.
// And when a request does carry credentials, none of them is logged.
func TestCSPReport_UnauthenticatedAndCredentialsNeverLogged(t *testing.T) {
	logs := captureLog(t)
	h := cspReportServer(t)

	if rr := postReport(h, "/bff/csp-report", "application/csp-report", legacyReport); rr.Code != http.StatusNoContent {
		t.Fatalf("no cookie, no CSRF token: status %d, want 204", rr.Code)
	}
	rr := postReport(h, "/bff/csp-report", "application/csp-report", legacyReport, func(r *http.Request) {
		r.AddCookie(&http.Cookie{Name: "__Host-admin_session", Value: "COOKIESECRET"})
		r.Header.Set("Authorization", "Bearer AUTHSECRET")
		r.Header.Set("X-CSRF-Token", "CSRFSECRET")
		r.Header.Set("User-Agent", "UASECRET")
	})
	if rr.Code != http.StatusNoContent {
		t.Fatalf("with cookies: status %d, want 204", rr.Code)
	}
	if got := rr.Header().Get("Set-Cookie"); got != "" {
		t.Errorf("the report route set a cookie: %q", got)
	}
	for _, s := range []string{"COOKIESECRET", "AUTHSECRET", "CSRFSECRET", "UASECRET", "admin_session"} {
		if strings.Contains(logs.String(), s) {
			t.Errorf("%s reached the log:\n%s", s, logs.String())
		}
	}
}

// The budget holds on the production path: an app built from LoadConfig with
// BFF_CSP_REPORT_RATE unset allows the default 30 reports per minute per IP,
// then answers 429 without reading or logging the body; another IP is still
// allowed.
func TestCSPReport_RateLimitFromLoadConfig(t *testing.T) {
	logs := captureLog(t)
	h := cspReportServer(t)

	fromCaddy := func(ip string) func(*http.Request) {
		return func(r *http.Request) {
			r.RemoteAddr = "127.0.0.1:5000" // Caddy on loopback: X-Forwarded-For is the client
			r.Header.Set("X-Forwarded-For", ip)
		}
	}
	const budget = 30
	for i := 1; i <= budget; i++ {
		if rr := postReport(h, "/bff/csp-report", "application/csp-report", legacyReport, fromCaddy("203.0.113.10")); rr.Code != http.StatusNoContent {
			t.Fatalf("report %d from one IP = %d, want 204", i, rr.Code)
		}
	}
	over := strings.Replace(legacyReport, "trusted-types-sink", "OVERBUDGET", 1)
	rr := postReport(h, "/bff/csp-report", "application/csp-report", over, fromCaddy("203.0.113.10"))
	if rr.Code != http.StatusTooManyRequests || rr.Header().Get("Retry-After") == "" {
		t.Fatalf("report %d from one IP = %d (Retry-After %q), want 429 with Retry-After", budget+1, rr.Code, rr.Header().Get("Retry-After"))
	}
	if strings.Contains(logs.String(), "OVERBUDGET") {
		t.Fatal("an over-budget report was logged")
	}
	if n := len(logs.lines()); n != budget {
		t.Errorf("logged %d lines, want %d", n, budget)
	}
	if rr := postReport(h, "/bff/csp-report", "application/csp-report", legacyReport, fromCaddy("203.0.113.11")); rr.Code != http.StatusNoContent {
		t.Fatalf("report from another IP = %d, want 204", rr.Code)
	}
}

// X-Forwarded-For names the client only when the peer is loopback (Caddy). A
// direct peer cannot rotate the key with a spoofed header.
func TestCSPReport_RateLimitXFFOnlyFromLoopback(t *testing.T) {
	captureLog(t)
	cspReportEnv(t)
	t.Setenv("BFF_CSP_REPORT_RATE", "2")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.CSPReportRate != 2 {
		t.Fatalf("CSPReportRate = %d, want the override 2", cfg.CSPReportRate)
	}
	h := NewServer(cfg)

	from := func(remote, xff string) func(*http.Request) {
		return func(r *http.Request) {
			r.RemoteAddr = remote
			r.Header.Set("X-Forwarded-For", xff)
		}
	}
	// Non-loopback peer: the header is ignored, so rotating it does not help.
	for i := 0; i < 4; i++ {
		rr := postReport(h, "/bff/csp-report", "application/csp-report", legacyReport, from("198.51.100.4:4000", fmt.Sprintf("10.0.0.%d", i+1)))
		want := http.StatusNoContent
		if i >= 2 {
			want = http.StatusTooManyRequests
		}
		if rr.Code != want {
			t.Fatalf("direct peer, spoofed XFF #%d: status %d, want %d", i+1, rr.Code, want)
		}
	}
	// Loopback peer (Caddy): each X-Forwarded-For client has its own budget.
	for i := 0; i < 4; i++ {
		rr := postReport(h, "/bff/csp-report", "application/csp-report", legacyReport, from("127.0.0.1:5000", fmt.Sprintf("203.0.113.%d", i+1)))
		if rr.Code != http.StatusNoContent {
			t.Fatalf("via Caddy, client #%d: status %d, want 204", i+1, rr.Code)
		}
	}
}
