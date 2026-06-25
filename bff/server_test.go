package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func testConfig(t *testing.T, upstream string) *Config {
	t.Helper()
	u, err := url.Parse(upstream)
	if err != nil {
		t.Fatalf("parse upstream: %v", err)
	}
	return &Config{ListenAddr: "127.0.0.1:0", AdminUpstream: u}
}

func TestHealthz(t *testing.T) {
	h := NewServer(testConfig(t, "http://127.0.0.1:8081"))

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/bff/healthz", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), `"status":"ok"`) {
		t.Errorf("body = %q, want status ok", rr.Body.String())
	}
}

func TestAdminProxyForwardsRequestAndAuthHeader(t *testing.T) {
	var gotPath, gotAuth string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("X-Backend", "admin-api")
		_, _ = io.WriteString(w, "users")
	}))
	defer backend.Close()

	h := NewServer(testConfig(t, backend.URL))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if gotPath != "/api/admin/users" {
		t.Errorf("upstream path = %q, want /api/admin/users", gotPath)
	}
	if gotAuth != "Bearer test-token" {
		t.Errorf("upstream Authorization = %q, want it forwarded unchanged", gotAuth)
	}
	if rr.Header().Get("X-Backend") != "admin-api" {
		t.Errorf("response header not passed through")
	}
	if rr.Body.String() != "users" {
		t.Errorf("body = %q, want passthrough", rr.Body.String())
	}
}

func TestNonAllowlistedPathsReturn404(t *testing.T) {
	// A backend that records whether the proxy ever forwarded a stray request.
	var hits int
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits++ }))
	defer backend.Close()

	h := NewServer(testConfig(t, backend.URL))

	cases := []struct {
		method, path string
	}{
		{http.MethodGet, "/"},
		{http.MethodGet, "/foo"},
		{http.MethodGet, "/api/other"},
		{http.MethodGet, "/api/admin"}, // missing trailing slash → not the subtree
		{http.MethodPost, "/bff/unknown"},
		{http.MethodGet, "/bff/"},
	}
	for _, c := range cases {
		t.Run(c.method+" "+c.path, func(t *testing.T) {
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, httptest.NewRequest(c.method, c.path, nil))
			if rr.Code == http.StatusOK {
				t.Errorf("status = 200, want non-200 (allowlist)")
			}
		})
	}
	if hits != 0 {
		t.Errorf("proxy forwarded %d non-allowlisted requests upstream, want 0", hits)
	}
}

func TestAdminProxyIsSSEAware(t *testing.T) {
	u, _ := url.Parse("http://127.0.0.1:8081")
	if got := newReverseProxy(u).FlushInterval; got != -1 {
		t.Errorf("FlushInterval = %v, want -1 (immediate flush for SSE)", got)
	}
}

func TestPathTraversalDoesNotEscapeAllowlist(t *testing.T) {
	var gotPath string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
	}))
	defer backend.Close()

	h := NewServer(testConfig(t, backend.URL))
	rr := httptest.NewRecorder()
	// The ServeMux cleans the path before matching; "/api/admin/../secret"
	// normalises to "/secret", which is not allow-listed.
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/admin/../secret", nil))

	if gotPath != "" {
		t.Errorf("traversal reached upstream at %q, want it blocked", gotPath)
	}
}
