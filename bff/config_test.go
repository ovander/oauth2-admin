package main

import (
	"strings"
	"testing"
	"time"
)

// phase2Env sets a minimal valid Phase-2 environment; tests override single
// keys on top of it.
func phase2Env(t *testing.T) {
	t.Helper()
	t.Setenv("BFF_LISTEN_ADDR", "")
	t.Setenv("BFF_ADMIN_UPSTREAM", "")
	t.Setenv("BFF_CLIENT_ID", "admin-console")
	t.Setenv("BFF_CLIENT_SECRET", "s3cret")
	t.Setenv("BFF_OAUTH_PUBLIC_URL", "https://socrate.example")
	t.Setenv("BFF_PUBLIC_ORIGIN", "https://admin.example")
	t.Setenv("BFF_COOKIE_SECURE", "")
	t.Setenv("BFF_SESSION_IDLE", "")
	t.Setenv("BFF_SESSION_ABSOLUTE", "")
	t.Setenv("BFF_PHASE1_PASSTHROUGH", "")
	t.Setenv("BFF_ALLOW_PASSTHROUGH", "")
	t.Setenv("BFF_LOGIN_RATE", "")
	t.Setenv("BFF_ELEVATE_RATE", "")
	t.Setenv("BFF_PASSWORD_RESET_RATE", "")
	t.Setenv("BFF_CSP_REPORT_RATE", "")
}

func TestLoadConfigDefaults(t *testing.T) {
	phase2Env(t)
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.ListenAddr != "127.0.0.1:8091" {
		t.Errorf("ListenAddr = %q, want 127.0.0.1:8091", cfg.ListenAddr)
	}
	if got := cfg.AdminUpstream.String(); got != "http://127.0.0.1:8081" {
		t.Errorf("AdminUpstream = %q, want http://127.0.0.1:8081", got)
	}
	if !cfg.Phase2Enabled() {
		t.Error("Phase2Enabled = false, want true when BFF_CLIENT_ID is set")
	}
	if !cfg.CookieSecure || cfg.SessionIdle != 30*time.Minute || cfg.SessionAbsolute != 8*time.Hour {
		t.Errorf("unexpected defaults: secure=%v idle=%s absolute=%s", cfg.CookieSecure, cfg.SessionIdle, cfg.SessionAbsolute)
	}
	if w := cfg.Warnings(); len(w) != 0 {
		t.Errorf("clean Phase-2 config should carry no warnings, got %v", w)
	}
}

func TestLoadConfigOverrides(t *testing.T) {
	phase2Env(t)
	t.Setenv("BFF_LISTEN_ADDR", "127.0.0.1:9999")
	t.Setenv("BFF_ADMIN_UPSTREAM", "http://10.0.0.1:8081")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.ListenAddr != "127.0.0.1:9999" {
		t.Errorf("ListenAddr = %q", cfg.ListenAddr)
	}
	if got := cfg.AdminUpstream.String(); got != "http://10.0.0.1:8081" {
		t.Errorf("AdminUpstream = %q", got)
	}
}

func TestLoadConfigInvalidUpstream(t *testing.T) {
	for _, raw := range []string{"not-a-url", "http://", "/only/path"} {
		t.Run(raw, func(t *testing.T) {
			phase2Env(t)
			t.Setenv("BFF_ADMIN_UPSTREAM", raw)
			if _, err := LoadConfig(); err == nil {
				t.Errorf("LoadConfig(%q) = nil error, want error", raw)
			}
		})
	}
}

// P3-26: the seeded default used to be Phase 1 — an unauthenticated
// pass-through to the admin API. It now has to be chosen explicitly.
func TestLoadConfigPhase1RequiresExplicitOptIn(t *testing.T) {
	phase2Env(t)
	t.Setenv("BFF_CLIENT_ID", "")
	t.Setenv("BFF_CLIENT_SECRET", "")

	_, err := LoadConfig()
	if err == nil || !strings.Contains(err.Error(), "BFF_PHASE1_PASSTHROUGH") {
		t.Fatalf("Phase 1 without opt-in must fail mentioning BFF_PHASE1_PASSTHROUGH; got %v", err)
	}

	t.Setenv("BFF_PHASE1_PASSTHROUGH", "true")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("Phase 1 with opt-in: %v", err)
	}
	if cfg.Phase2Enabled() {
		t.Error("Phase2Enabled = true, want false when BFF_CLIENT_ID is empty")
	}
	if w := cfg.Warnings(); len(w) != 1 || !strings.Contains(w[0], "BFF_PHASE1_PASSTHROUGH") {
		t.Errorf("Phase 1 must be surfaced as a startup warning, got %v", w)
	}
}

func TestLoadConfigRejectsUnsafeCombinations(t *testing.T) {
	cases := []struct {
		name string
		key  string
		val  string
		want string
	}{
		{"insecure cookie on https origin", "BFF_COOKIE_SECURE", "false", "BFF_COOKIE_SECURE"},
		{"zero idle", "BFF_SESSION_IDLE", "0s", "BFF_SESSION_IDLE"},
		{"negative absolute", "BFF_SESSION_ABSOLUTE", "-1h", "BFF_SESSION_ABSOLUTE"},
		{"missing client secret", "BFF_CLIENT_SECRET", "", "BFF_CLIENT_SECRET"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			phase2Env(t)
			t.Setenv(c.key, c.val)
			_, err := LoadConfig()
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("want error mentioning %s, got %v", c.want, err)
			}
		})
	}
}

func TestLoadConfigInsecureCookieAllowedForHTTPDevOrigin(t *testing.T) {
	phase2Env(t)
	t.Setenv("BFF_PUBLIC_ORIGIN", "http://localhost:5173")
	t.Setenv("BFF_COOKIE_SECURE", "false")
	if _, err := LoadConfig(); err != nil {
		t.Fatalf("insecure cookie on an http dev origin must be allowed: %v", err)
	}
}

func TestLoadConfigAllowPassthroughIsWarned(t *testing.T) {
	phase2Env(t)
	t.Setenv("BFF_ALLOW_PASSTHROUGH", "true")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if w := cfg.Warnings(); len(w) != 1 || !strings.Contains(w[0], "BFF_ALLOW_PASSTHROUGH") {
		t.Errorf("AllowPassthrough must be surfaced as a warning, got %v", w)
	}
}

// The per-IP budgets are read from the environment, and a value that would
// switch a limiter off (zero, negative) or that cannot be parsed falls back to
// the default: a budget is never disabled from the environment. Before the
// fix, BFF_PASSWORD_RESET_RATE was never read and the budget was always 0.
func TestLoadConfigRateBudgets(t *testing.T) {
	budgets := []struct {
		key string
		def int
		get func(*Config) int
	}{
		{"BFF_PASSWORD_RESET_RATE", 5, func(c *Config) int { return c.PasswordResetRate }},
		{"BFF_LOGIN_RATE", 10, func(c *Config) int { return c.LoginRate }},
		{"BFF_ELEVATE_RATE", 5, func(c *Config) int { return c.ElevateRate }},
		{"BFF_CSP_REPORT_RATE", 30, func(c *Config) int { return c.CSPReportRate }},
	}
	for _, b := range budgets {
		for _, c := range []struct {
			val  string
			want int
		}{
			{"", b.def},     // unset: the default
			{"3", 3},        // explicit override is honoured
			{"0", b.def},    // zero would disable the limiter: default
			{"-1", b.def},   // negative would disable the limiter: default
			{"five", b.def}, // unparsable: default
		} {
			t.Run(b.key+"="+c.val, func(t *testing.T) {
				phase2Env(t)
				t.Setenv(b.key, c.val)
				cfg, err := LoadConfig()
				if err != nil {
					t.Fatalf("LoadConfig: %v", err)
				}
				if got := b.get(cfg); got != c.want {
					t.Errorf("%s=%q: got %d, want %d", b.key, c.val, got, c.want)
				}
			})
		}
	}
}
