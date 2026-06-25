package main

import (
	"encoding/json"
	"net/http"
)

// NewServer builds the BFF HTTP handler.
//
// It is a strict allowlist — NEVER an open proxy. Only two route families are
// served; everything else is 404:
//
//	GET /bff/healthz   → liveness
//	    /api/admin/*   → SSE-aware reverse proxy to the admin API upstream
//
// Phase 2 adds /bff/login, /bff/callback, /bff/session, /bff/logout and wraps
// the admin proxy with session→token injection (gated on Config.Phase2Enabled).
func NewServer(cfg *Config) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /bff/healthz", handleHealthz)

	mux.Handle("/api/admin/", newAdminProxy(cfg.AdminUpstream))

	// Catch-all: anything outside the allowlist is 404. This keeps the BFF an
	// allowlist and prevents it from ever acting as an open proxy.
	mux.HandleFunc("/", http.NotFound)

	return mux
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
