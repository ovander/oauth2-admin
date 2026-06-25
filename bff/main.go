// Command socrate-admin-bff is the Backend-for-Frontend for the Socrate admin
// console. It binds loopback only and is the sole client of the admin API for
// this console.
//
// Phase 1 (BFF_CLIENT_ID unset): an allowlisted, SSE-aware reverse proxy that
// forwards the browser's bearer token unchanged.
//
// Phase 2 (BFF_CLIENT_ID set): server-side sessions — Authorization-Code + PKCE
// login, an opaque HttpOnly session cookie, and server-side token injection on
// the admin proxy so the browser never holds a token.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	a := newApp(cfg)
	a.startBackground(ctx)

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           a.handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("socrate-admin-bff listening on %s → admin upstream %s (phase2=%v)",
			cfg.ListenAddr, cfg.AdminUpstream, cfg.Phase2Enabled())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutdown signal received, draining…")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}
