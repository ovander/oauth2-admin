package main

import (
	"encoding/json"
	"net/http"
	"path"
)

// NewServer builds the BFF HTTP handler for the given config (no background
// sweepers — use newApp + startBackground for the full lifecycle in main).
//
// It is a strict allowlist — NEVER an open proxy:
//
//	GET  /bff/healthz   liveness (always)
//	     /bff/login,/bff/callback,/bff/session,/bff/logout,/bff/elevate   (Phase 2 only)
//	     /api/admin/*   reverse proxy (session→token injection in Phase 2)
//	     /api/profile   issuer self-service, session-authenticated (Phase 2 only)
//	GET  /api/version   issuer version probe (public, pass-through)
//	POST /api/auth/request-password-reset, /api/auth/reset-password
//	                    issuer pre-auth flows (public, per-IP rate limited)
//
// everything else → 404.
func NewServer(cfg *Config) http.Handler {
	return newApp(cfg).handler()
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// canonicalPathOnly rejects any request whose path is not already in canonical
// form before it can reach an allowlist match (P3-18). http.ServeMux redirects
// a literal "/api/admin/../x", but a percent-encoded dot-segment
// ("/api/admin/%2e%2e/x") is matched on its escaped form, forwarded verbatim,
// and only normalised by the UPSTREAM — whose idea of the resulting path may
// differ from ours. Refusing non-canonical paths outright keeps the allowlist
// decision and the upstream's routing decision on the same string.
func canonicalPathOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		clean := path.Clean(p)
		// RawPath is only set when the request used a non-default encoding
		// (e.g. %2e for "."), which is never legitimate for these routes.
		if r.URL.RawPath != "" || (p != clean && p != clean+"/") {
			http.NotFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}
