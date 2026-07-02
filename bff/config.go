package main

import (
	"fmt"
	"net/url"
	"os"
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

	// AllowPassthrough, when true, restores the legacy dual-mode behaviour where
	// a request without a valid session is proxied through with its own
	// browser-supplied Authorization header (no CSRF check). It defaults to
	// FALSE: the proxy is fail-closed and returns 401 when auth is enabled and
	// there is no session. Only enable this temporarily for migration.
	AllowPassthrough bool
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
		ListenAddr:       getenv("BFF_LISTEN_ADDR", "127.0.0.1:8091"),
		ClientID:         os.Getenv("BFF_CLIENT_ID"),
		ClientSecret:     os.Getenv("BFF_CLIENT_SECRET"),
		OAuthPublicURL:   strings.TrimRight(getenv("BFF_OAUTH_PUBLIC_URL", "https://socrate.vandermoten.eu"), "/"),
		PublicOrigin:     strings.TrimRight(getenv("BFF_PUBLIC_ORIGIN", "https://admin.vandermoten.eu"), "/"),
		Scopes:           getenv("BFF_SCOPES", "openid profile email"),
		CookieSecure:     getBool("BFF_COOKIE_SECURE", true),
		AllowPassthrough: getBool("BFF_ALLOW_PASSTHROUGH", false),
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

	if cfg.Phase2Enabled() {
		for k, v := range map[string]string{"BFF_OAUTH_PUBLIC_URL": cfg.OAuthPublicURL, "BFF_PUBLIC_ORIGIN": cfg.PublicOrigin} {
			if v == "" {
				return nil, fmt.Errorf("%s is required when BFF_CLIENT_ID is set", k)
			}
		}
	}
	return cfg, nil
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
