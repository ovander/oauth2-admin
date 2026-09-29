package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// CSP violation reports (POST /bff/csp-report).
//
// The browser POSTs a report when a page violates the Content-Security-Policy
// or the Content-Security-Policy-Report-Only header (csp.ts:
// productionCspReportOnly(), `report-uri /bff/csp-report; report-to csp`, and
// the `Reporting-Endpoints: csp="/bff/csp-report"` header). The route is served
// WITHOUT a session and WITHOUT X-CSRF-Token, unlike every other /bff/* POST:
// browsers send reports with no cookie and cannot add a header. That is safe
// because the handler only writes a log line. It never reads or touches a
// session, never calls an upstream, and changes no state, so a forged or
// cross-site report can at worst add log lines, which the per-IP budget, the
// body cap and the per-request line cap bound.

const (
	// cspReportMaxBody caps the request body; a larger one is refused (413).
	cspReportMaxBody = 8 << 10
	// cspReportMaxLogged caps the violations logged per request (a
	// reports+json array may carry several).
	cspReportMaxLogged = 10
	// cspReportMaxField caps each logged field, in bytes.
	cspReportMaxField = 256

	mediaCSPReport  = "application/csp-report"   // report-uri (legacy)
	mediaReportJSON = "application/reports+json" // report-to (Reporting API)
)

// legacyCSPReport is the `report-uri` body: {"csp-report": {...}}.
type legacyCSPReport struct {
	Report *struct {
		DocumentURI        string      `json:"document-uri"`
		BlockedURI         string      `json:"blocked-uri"`
		ViolatedDirective  string      `json:"violated-directive"`
		EffectiveDirective string      `json:"effective-directive"`
		SourceFile         string      `json:"source-file"`
		LineNumber         json.Number `json:"line-number"`
		ColumnNumber       json.Number `json:"column-number"`
		Disposition        string      `json:"disposition"`
		ScriptSample       string      `json:"script-sample"`
	} `json:"csp-report"`
}

// reportingAPIReport is one entry of a `report-to` body, an array of
// {type, url, body}; only "csp-violation" entries are logged.
type reportingAPIReport struct {
	Type string `json:"type"`
	URL  string `json:"url"`
	Body struct {
		DocumentURL        string      `json:"documentURL"`
		BlockedURL         string      `json:"blockedURL"`
		EffectiveDirective string      `json:"effectiveDirective"`
		SourceFile         string      `json:"sourceFile"`
		LineNumber         json.Number `json:"lineNumber"`
		ColumnNumber       json.Number `json:"columnNumber"`
		Disposition        string      `json:"disposition"`
		Sample             string      `json:"sample"`
	} `json:"body"`
}

// cspViolation is the normalised subset of a report the BFF logs. The raw
// body, the policy text and the code sample are never logged; for a Trusted
// Types violation only the sink name is kept from the sample.
type cspViolation struct {
	directive, blocked, document, source, line, column, disposition, sample string
}

// handleCSPReport logs CSP violation reports. See the comment at the top of
// this file for why it needs neither a session nor a CSRF token.
func (a *app) handleCSPReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Budget first: an over-budget report is refused before its body is read.
	if a.rateLimited(w, r, a.cspReportLimiter) {
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || (mediaType != mediaCSPReport && mediaType != mediaReportJSON) {
		http.Error(w, "unsupported media type", http.StatusUnsupportedMediaType)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, cspReportMaxBody))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			http.Error(w, "report too large", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "unreadable report", http.StatusBadRequest)
		return
	}
	violations, err := parseCSPReport(mediaType, body)
	if err != nil {
		http.Error(w, "malformed report", http.StatusBadRequest)
		return
	}
	for i, v := range violations {
		if i == cspReportMaxLogged {
			log.Printf("csp-report: %d more violation(s) in this request not logged", len(violations)-i)
			break
		}
		log.Print(v.logLine())
	}
	w.WriteHeader(http.StatusNoContent)
}

// parseCSPReport decodes a body of the given media type into violations.
func parseCSPReport(mediaType string, body []byte) ([]cspViolation, error) {
	if mediaType == mediaCSPReport {
		var rep legacyCSPReport
		if err := json.Unmarshal(body, &rep); err != nil {
			return nil, err
		}
		if rep.Report == nil {
			return nil, errors.New(`missing "csp-report"`)
		}
		c := rep.Report
		directive := c.EffectiveDirective
		if directive == "" {
			directive = c.ViolatedDirective
		}
		return []cspViolation{{
			directive:   directive,
			blocked:     c.BlockedURI,
			document:    c.DocumentURI,
			source:      c.SourceFile,
			line:        c.LineNumber.String(),
			column:      c.ColumnNumber.String(),
			disposition: c.Disposition,
			sample:      trustedTypesSink(directive, c.ScriptSample),
		}}, nil
	}

	var reps []reportingAPIReport
	if err := json.Unmarshal(body, &reps); err != nil {
		return nil, err
	}
	var out []cspViolation
	for _, rep := range reps {
		if rep.Type != "csp-violation" {
			continue
		}
		b := rep.Body
		document := b.DocumentURL
		if document == "" {
			document = rep.URL
		}
		out = append(out, cspViolation{
			directive:   b.EffectiveDirective,
			blocked:     b.BlockedURL,
			document:    document,
			source:      b.SourceFile,
			line:        b.LineNumber.String(),
			column:      b.ColumnNumber.String(),
			disposition: b.Disposition,
			sample:      trustedTypesSink(b.EffectiveDirective, b.Sample),
		})
	}
	return out, nil
}

// trustedTypesSink returns the sink name ("Element innerHTML") of a Trusted
// Types sample ("Element innerHTML|<b>x</b>"), dropping the value itself. Any
// other sample may carry page content and is not kept.
func trustedTypesSink(directive, sample string) string {
	if directive != "require-trusted-types-for" {
		return ""
	}
	sink, _, _ := strings.Cut(sample, "|")
	return sink
}

// logLine renders one compact key=value line; empty fields are omitted, and
// each value is sanitised, truncated and quoted.
func (v cspViolation) logLine() string {
	var b strings.Builder
	b.WriteString("csp-report:")
	field := func(k, val string) {
		if val = sanitizeLogField(val); val != "" {
			b.WriteString(" " + k + "=" + strconv.Quote(val))
		}
	}
	number := func(k, val string) {
		if n, err := strconv.ParseUint(val, 10, 32); err == nil && n > 0 {
			b.WriteString(" " + k + "=" + strconv.FormatUint(n, 10))
		}
	}
	field("disposition", v.disposition)
	field("directive", v.directive)
	field("blocked", stripQueryAndFragment(v.blocked))
	field("document", stripQueryAndFragment(v.document))
	field("source", stripQueryAndFragment(v.source))
	number("line", v.line)
	number("column", v.column)
	field("sink", v.sample)
	return b.String()
}

// stripQueryAndFragment removes the query string, the fragment and any
// userinfo from a URL-like report field: the reset-password page carries its
// token in the query. A value that is not an absolute URL, such as the
// keywords "inline", "eval" or "trusted-types-sink", is returned unchanged,
// except that anything from a '?' or '#' on is still dropped.
func stripQueryAndFragment(s string) string {
	if u, err := url.Parse(s); err == nil && u.Scheme != "" {
		u.User = nil
		u.RawQuery, u.ForceQuery = "", false
		u.Fragment, u.RawFragment = "", ""
		return u.String()
	}
	if i := strings.IndexAny(s, "?#"); i >= 0 {
		return s[:i]
	}
	return s
}

// sanitizeLogField drops control characters and invalid UTF-8 (no log
// injection through a forged report) and truncates to cspReportMaxField bytes
// on a rune boundary.
func sanitizeLogField(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r == utf8.RuneError || unicode.IsControl(r) || r == '\u2028' || r == '\u2029' {
			continue
		}
		if b.Len()+utf8.RuneLen(r) > cspReportMaxField {
			break
		}
		b.WriteRune(r)
	}
	return b.String()
}
