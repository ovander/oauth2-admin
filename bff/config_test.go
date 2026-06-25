package main

import "testing"

func TestLoadConfigDefaults(t *testing.T) {
	t.Setenv("BFF_LISTEN_ADDR", "")
	t.Setenv("BFF_ADMIN_UPSTREAM", "")
	t.Setenv("BFF_CLIENT_ID", "")

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
	if cfg.Phase2Enabled() {
		t.Error("Phase2Enabled = true, want false when BFF_CLIENT_ID is empty")
	}
}

func TestLoadConfigOverrides(t *testing.T) {
	t.Setenv("BFF_LISTEN_ADDR", "127.0.0.1:9999")
	t.Setenv("BFF_ADMIN_UPSTREAM", "http://10.0.0.1:8081")
	t.Setenv("BFF_CLIENT_ID", "admin-console")

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
	if !cfg.Phase2Enabled() {
		t.Error("Phase2Enabled = false, want true when BFF_CLIENT_ID is set")
	}
}

func TestLoadConfigInvalidUpstream(t *testing.T) {
	for _, raw := range []string{"not-a-url", "http://", "/only/path"} {
		t.Run(raw, func(t *testing.T) {
			t.Setenv("BFF_ADMIN_UPSTREAM", raw)
			if _, err := LoadConfig(); err == nil {
				t.Errorf("LoadConfig(%q) = nil error, want error", raw)
			}
		})
	}
}
