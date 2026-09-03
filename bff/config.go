package main

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the BFF runtime configuration, loaded from the environment.
//
// Phase 1 uses only ListenAddr + AdminUpstream (an allowlisted reverse proxy to
// the admin API). Phase 2 (server-side sessions) activates when ClientID is set
// — see Phase2Enabled.
type Config struct {
	ListenAddr    string
	AdminUpstream *url.URL

	// ── Phase 2 (server-side sessions) ──────────────────────────────────────
	ClientID        string
	ClientSecret    string
	OAuthUpstream   *url.URL // back-channel token endpoint base (loopback)
	OAuthPublicURL  string   // browser-facing authorize base (no trailing slash)
	PublicOrigin    string   // this BFF's public origin, for redirect_uri
	Scopes          string
	SessionIdle     time.Duration
	SessionAbsolute time.Duration
	CookieSecure    bool

	// Per-IP request budgets (per rateWindow) for the credential-bearing
	// endpoints. LoginRate guards /bff/login (login-state flooding); ElevateRate
	// guards /bff/elevate (password + MFA brute force). A value <= 0 falls back
	// to the default.
	LoginRate   int
	ElevateRate int
	// PasswordResetRate guards the two public issuer password-reset posts the
	// BFF forwards (P3-23); both trigger email, so the budget is small.
	PasswordResetRate int

	// AllowPassthrough, when true, restores the legacy dual-mode behaviour where
	// a request without a valid session is proxied through with its own
	// browser-supplied Authorization header (no CSRF check). It defaults to
	// FALSE: the proxy is fail-closed and returns 401 when auth is enabled and
	// there is no session. Only enable this temporarily for migration.
	AllowPassthrough bool

	// Phase1Passthrough (BFF_PHASE1_PASSTHROUGH) is the explicit opt-in
	// required to run WITHOUT server-side sessions (BFF_CLIENT_ID unset). In
	// that mode the BFF is a bare pass-through: every /api/admin/* request —
	// including the public POST /api/admin/login — reaches the loopback-only
	// admin API from the internet with whatever Authorization header the
	// browser sends and no CSRF check. That was the seeded default (P3-26);
	// it must now be chosen deliberately, and only for a migration window.
	Phase1Passthrough bool
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getDuration(key string, def time.Duration) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("%s: invalid duration %q: %w", key, v, err)
	}
	return d, nil
}

func getInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}

func getBool(key string, def bool) bool {
	switch strings.ToLower(os.Getenv(key)) {
	case "":
		return def
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return def
	}
}

// LoadConfig reads and validates configuration from the environment.
func LoadConfig() (*Config, error) {
	cfg := &Config{
		ListenAddr:        getenv("BFF_LISTEN_ADDR", "127.0.0.1:8091"),
		ClientID:          os.Getenv("BFF_CLIENT_ID"),
		ClientSecret:      os.Getenv("BFF_CLIENT_SECRET"),
		OAuthPublicURL:    strings.TrimRight(getenv("BFF_OAUTH_PUBLIC_URL", "https://socrate.vandermoten.eu"), "/"),
		PublicOrigin:      strings.TrimRight(getenv("BFF_PUBLIC_ORIGIN", "https://admin.vandermoten.eu"), "/"),
		Scopes:            getenv("BFF_SCOPES", "openid profile email"),
		CookieSecure:      getBool("BFF_COOKIE_SECURE", true),
		AllowPassthrough:  getBool("BFF_ALLOW_PASSTHROUGH", false),
		Phase1Passthrough: getBool("BFF_PHASE1_PASSTHROUGH", false),
		LoginRate:         getInt("BFF_LOGIN_RATE", 10),
		ElevateRate:       getInt("BFF_ELEVATE_RATE", 5),
	}
	if cfg.ListenAddr == "" {
		return nil, fmt.Errorf("BFF_LISTEN_ADDR must not be empty")
	}

	var err error
	if cfg.AdminUpstream, err = parseUpstream("BFF_ADMIN_UPSTREAM", getenv("BFF_ADMIN_UPSTREAM", "http://127.0.0.1:8081")); err != nil {
		return nil, err
	}
	if cfg.OAuthUpstream, err = parseUpstream("BFF_OAUTH_UPSTREAM", getenv("BFF_OAUTH_UPSTREAM", "http://127.0.0.1:8080")); err != nil {
		return nil, err
	}
	if cfg.SessionIdle, err = getDuration("BFF_SESSION_IDLE", 30*time.Minute); err != nil {
		return nil, err
	}
	if cfg.SessionAbsolute, err = getDuration("BFF_SESSION_ABSOLUTE", 8*time.Hour); err != nil {
		return nil, err
	}

	if !cfg.Phase2Enabled() {
		// P3-26: never run as an open pass-through by accident.
		if !cfg.Phase1Passthrough {
			return nil, fmt.Errorf("BFF_CLIENT_ID is not set: server-side sessions are disabled and the BFF would be an " +
				"unauthenticated pass-through to the admin API; set BFF_CLIENT_ID (+ BFF_CLIENT_SECRET) to enable Phase 2, " +
				"or BFF_PHASE1_PASSTHROUGH=true to run Phase 1 deliberately for a migration window")
		}
		return cfg, nil
	}

	for k, v := range map[string]string{"BFF_OAUTH_PUBLIC_URL": cfg.OAuthPublicURL, "BFF_PUBLIC_ORIGIN": cfg.PublicOrigin} {
		if v == "" {
			return nil, fmt.Errorf("%s is required when BFF_CLIENT_ID is set", k)
		}
	}
	if cfg.ClientSecret == "" {
		return nil, fmt.Errorf("BFF_CLIENT_SECRET is required when BFF_CLIENT_ID is set (the BFF is a confidential client)")
	}
	// A non-Secure cookie on an https origin drops the __Host- prefix and the
	// Secure attribute — the cookie would ride any plaintext request. Only
	// permit it for a plain-http (local dev) origin.
	if !cfg.CookieSecure && strings.HasPrefix(strings.ToLower(cfg.PublicOrigin), "https://") {
		return nil, fmt.Errorf("BFF_COOKIE_SECURE=false is only allowed with a non-https BFF_PUBLIC_ORIGIN (local development); got %q", cfg.PublicOrigin)
	}
	// Zero/negative lifetimes silently disable the bound on the in-memory
	// store (and would mean "expire immediately" on a durable one).
	if cfg.SessionIdle <= 0 {
		return nil, fmt.Errorf("BFF_SESSION_IDLE must be positive, got %s", cfg.SessionIdle)
	}
	if cfg.SessionAbsolute <= 0 {
		return nil, fmt.Errorf("BFF_SESSION_ABSOLUTE must be positive, got %s", cfg.SessionAbsolute)
	}
	return cfg, nil
}

// Warnings lists deliberately-unsafe settings that are legal but must be
// visible in the startup log, so a migration flag cannot linger unnoticed.
func (c *Config) Warnings() []string {
	var w []string
	if !c.Phase2Enabled() {
		w = append(w, "BFF_PHASE1_PASSTHROUGH=true: no server-side sessions — /api/admin/* (incl. POST /api/admin/login) is an unauthenticated pass-through; disable as soon as Phase 2 is configured")
	}
	if c.AllowPassthrough {
		w = append(w, "BFF_ALLOW_PASSTHROUGH=true: requests without a session are forwarded with the browser's own Authorization header and no CSRF check; disable after the migration window")
	}
	return w
}

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
