package main

import (
	"encoding/json"
	"net/http"
)

// NewServer builds the BFF HTTP handler for the given config (no background
// sweepers — use newApp + startBackground for the full lifecycle in main).
//
// It is a strict allowlist — NEVER an open proxy:
//
//	GET  /bff/healthz   liveness (always)
//	     /bff/login,/bff/callback,/bff/session,/bff/logout   (Phase 2 only)
//	     /api/admin/*   reverse proxy (session→token injection in Phase 2)
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
