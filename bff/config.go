package main

import (
	"fmt"
	"net/url"
	"os"
)

// Config is the BFF runtime configuration, loaded from the environment.
//
// Phase 1 uses only ListenAddr + AdminUpstream (an allowlisted reverse proxy to
// the admin API). The Phase 2 session/login fields are parsed here too so the
// seam is visible; they take effect only when ClientID is set (Phase2Enabled).
type Config struct {
	ListenAddr    string
	AdminUpstream *url.URL

	// Phase 2 (server-side sessions) — unused until ClientID is set.
	ClientID string
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// LoadConfig reads and validates configuration from the environment.
func LoadConfig() (*Config, error) {
	cfg := &Config{
		ListenAddr: getenv("BFF_LISTEN_ADDR", "127.0.0.1:8091"),
		ClientID:   os.Getenv("BFF_CLIENT_ID"),
	}

	upstream, err := parseUpstream("BFF_ADMIN_UPSTREAM", getenv("BFF_ADMIN_UPSTREAM", "http://127.0.0.1:8081"))
	if err != nil {
		return nil, err
	}
	cfg.AdminUpstream = upstream

	if cfg.ListenAddr == "" {
		return nil, fmt.Errorf("BFF_LISTEN_ADDR must not be empty")
	}
	return cfg, nil
}

// parseUpstream requires an absolute URL (scheme://host).
func parseUpstream(name, raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("%s: invalid URL %q: %w", name, raw, err)
	}
	if u.Scheme == "" || u.Host == "" {
		return nil, fmt.Errorf("%s must be an absolute URL (scheme://host), got %q", name, raw)
	}
	return u, nil
}

// Phase2Enabled reports whether server-side sessions/login are configured.
func (c *Config) Phase2Enabled() bool { return c.ClientID != "" }
