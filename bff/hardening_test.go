package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ovander/backendkit/bff"
	"github.com/ovander/backendkit/socrate"
)

// Pass-3 Low/Info hardening: P3-17, P3-18, P3-19, P3-20, P3-21, P3-23, P2-11.

// ── P3-17: X-Forwarded-For is only trusted from a loopback peer ──────────────

func TestClientIP_HonoursXFFOnlyFromLoopback(t *testing.T) {
	cases := []struct{ remote, xff, want string }{
		{"127.0.0.1:1234", "203.0.113.9, 127.0.0.1", "203.0.113.9"}, // Caddy on the same host
		{"[::1]:1234", "203.0.113.9", "203.0.113.9"},
		{"127.0.0.1:1234", "", "127.0.0.1"},
		{"127.0.0.1:1234", "not-an-ip", "127.0.0.1"},
		{"198.51.100.4:1234", "203.0.113.9", "198.51.100.4"}, // non-loopback peer: header ignored
		{"198.51.100.4:1234", "", "198.51.100.4"},
	}
	for _, c := range cases {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = c.remote
		if c.xff != "" {
			r.Header.Set("X-Forwarded-For", c.xff)
		}
		if got := clientIP(r); got != c.want {
			t.Errorf("remote=%s xff=%q: clientIP = %q, want %q", c.remote, c.xff, got, c.want)
		}
	}
}

func TestRateLimit_CannotBeRotatedViaXFFFromNonLoopbackPeer(t *testing.T) {
	a := &app{}
	rl := newRateLimiter(2, time.Minute)
	for i := 0; i < 5; i++ {
		rr := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/bff/login", nil)
		r.RemoteAddr = "198.51.100.4:4000"
		r.Header.Set("X-Forwarded-For", "10.0.0."+string(rune('1'+i))) // a fresh spoofed key each time
		limited := a.rateLimited(rr, r, rl)
		if i < 2 && limited {
			t.Fatalf("request %d limited too early", i)
		}
		if i >= 2 && !limited {
			t.Fatalf("request %d not limited: spoofed X-Forwarded-For rotated the key", i)
		}
	}
}

// ── P3-18: non-canonical paths never reach an upstream ───────────────────────

func TestEncodedDotSegmentsAreRejected(t *testing.T) {
	var mu sync.Mutex
	var reached []string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		reached = append(reached, r.URL.EscapedPath())
		mu.Unlock()
	}))
	defer backend.Close()

	h := NewServer(testConfig(t, backend.URL))
	for _, target := range []string{
		"/api/admin/%2e%2e/secret",
		"/api/admin/%2E%2E/secret",
		"/api/admin/users/%2e%2e/%2e%2e/secret",
		"/api/admin//users",
		"/api/admin/./users",
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, target, nil))
		if rr.Code != http.StatusNotFound {
			t.Errorf("%s: status %d, want 404", target, rr.Code)
		}
	}
	mu.Lock()
	defer mu.Unlock()
	if len(reached) != 0 {
		t.Fatalf("non-canonical paths reached the upstream: %v", reached)
	}
}

func TestCanonicalPathsStillProxy(t *testing.T) {
	var got string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.URL.Path
	}))
	defer backend.Close()
	h := NewServer(testConfig(t, backend.URL))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/admin/users/42?x=%20y", nil))
	if rr.Code != http.StatusOK || got != "/api/admin/users/42" {
		t.Fatalf("status %d upstream path %q", rr.Code, got)
	}
}

// ── P3-19 / P3-20: logout needs CSRF; /bff/session is no-store ───────────────

func seededSession(t *testing.T, a *app, csrf string) *http.Cookie {
	t.Helper()
	sid := bff.RandomToken(16)
	ts := &socrate.TokenSet{AccessToken: "access-1", RefreshToken: "refresh-1", ExpiresIn: 300}
	a.store.Put(bff.NewSession(sid, csrf, ts, bff.UserInfo{Sub: "user-1"}, time.Now()))
	return &http.Cookie{Name: a.cookieName(), Value: sid}
}

func TestLogoutRequiresCSRF(t *testing.T) {
	h, a, _, rev, _, _ := phase2Harness(t)
	cookie := seededSession(t, a, "csrf-1")

	for _, hdr := range []string{"", "wrong"} {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/bff/logout", nil)
		req.AddCookie(cookie)
		if hdr != "" {
			req.Header.Set("X-CSRF-Token", hdr)
		}
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusForbidden {
			t.Fatalf("logout with csrf %q = %d, want 403", hdr, rr.Code)
		}
	}
	if _, ok := a.store.Get(cookie.Value); !ok {
		t.Fatal("session was dropped by a CSRF-less logout")
	}
	if tokens, _, _ := rev.snapshot(); len(tokens) != 0 {
		t.Fatalf("tokens revoked by a CSRF-less logout: %v", tokens)
	}

	// No session at all: nothing to protect, still clears the cookie.
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/bff/logout", nil))
	if rr.Code != http.StatusNoContent {
		t.Fatalf("session-less logout = %d, want 204", rr.Code)
	}
}

func TestSessionEndpointIsNoStore(t *testing.T) {
	h, a, _, _, _, _ := phase2Harness(t)
	cookie := seededSession(t, a, "csrf-1")
	for _, withCookie := range []bool{true, false} {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/bff/session", nil)
		if withCookie {
			req.AddCookie(cookie)
		}
		h.ServeHTTP(rr, req)
		if got := rr.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("cookie=%v: Cache-Control = %q, want no-store", withCookie, got)
		}
	}
}

// ── P3-21 / P2-11: elevate forwards only 4xx; fails closed on a bad exp ──────

// elevateHarness is phase2Harness with a scriptable /api/admin/elevate.
func elevateHarness(t *testing.T, respond func(w http.ResponseWriter)) (http.Handler, *app) {
	t.Helper()
	admin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/admin/elevate" {
			respond(w)
			return
		}
		_, _ = io.WriteString(w, "admin-ok")
	}))
	t.Cleanup(admin.Close)
	as := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	t.Cleanup(as.Close)
	adminURL, _ := url.Parse(admin.URL)
	asURL, _ := url.Parse(as.URL)
	cfg := &Config{
		ListenAddr: "127.0.0.1:0", AdminUpstream: adminURL,
		ClientID: "admin-console", ClientSecret: "secret",
		OAuthUpstream: asURL, OAuthPublicURL: "https://as.example", PublicOrigin: "https://admin.example",
		Scopes: "openid", SessionIdle: 30 * time.Minute, SessionAbsolute: 8 * time.Hour,
	}
	a := newApp(cfg)
	return a.handler(), a
}

func postElevate(h http.Handler, cookie *http.Cookie) *httptest.ResponseRecorder {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/bff/elevate", strings.NewReader(`{"password":"pw","mfa_code":"123456"}`))
	req.AddCookie(cookie)
	req.Header.Set("X-CSRF-Token", "csrf-1")
	h.ServeHTTP(rr, req)
	return rr
}

func TestElevate_ForwardsOnly4xxBodies(t *testing.T) {
	const leak = "<html>upstream stack trace: /srv/admin/main.go:42</html>"
	h, a := elevateHarness(t, func(w http.ResponseWriter) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = io.WriteString(w, leak)
	})
	rr := postElevate(h, seededSession(t, a, "csrf-1"))
	if rr.Code != http.StatusBadGateway {
		t.Fatalf("status %d, want 502", rr.Code)
	}
	if strings.Contains(rr.Body.String(), "stack trace") {
		t.Fatalf("upstream 5xx body forwarded to the browser: %q", rr.Body.String())
	}

	h, a = elevateHarness(t, func(w http.ResponseWriter) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "mfa_required"})
	})
	rr = postElevate(h, seededSession(t, a, "csrf-1"))
	if rr.Code != http.StatusUnauthorized || !strings.Contains(rr.Body.String(), "mfa_required") {
		t.Fatalf("4xx challenge not forwarded: %d %q", rr.Code, rr.Body.String())
	}
}

func TestElevate_FailsClosedWithoutUsableExp(t *testing.T) {
	for name, token := range map[string]string{
		"no exp":      makeJWT(map[string]any{"sub": "user-1"}),
		"expired":     makeJWT(map[string]any{"sub": "user-1", "exp": float64(time.Now().Add(-time.Minute).Unix())}),
		"not a jwt":   "opaque-token",
		"exp not num": makeJWT(map[string]any{"sub": "user-1", "exp": "soon"}),
	} {
		h, a := elevateHarness(t, func(w http.ResponseWriter) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"access_token": token})
		})
		cookie := seededSession(t, a, "csrf-1")
		rr := postElevate(h, cookie)
		if rr.Code != http.StatusBadGateway {
			t.Errorf("%s: status %d, want 502", name, rr.Code)
		}
		s, ok := a.store.Get(cookie.Value)
		if !ok {
			t.Fatalf("%s: session disappeared", name)
		}
		if s.AccessToken() != "access-1" {
			t.Errorf("%s: unusable token absorbed into the session", name)
		}
	}
}

func TestElevatedTokenTTL(t *testing.T) {
	now := time.Unix(1_000_000, 0)
	ok := makeJWT(map[string]any{"exp": float64(now.Add(90 * time.Second).Unix())})
	if got := elevatedTokenTTL(ok, now); got != 90 {
		t.Errorf("ttl = %d, want 90", got)
	}
	if got := elevatedTokenTTL(makeJWT(map[string]any{"exp": float64(now.Unix())}), now); got != 0 {
		t.Errorf("ttl at exp = %d, want 0", got)
	}
}

// ── P3-23: public issuer routes pass through, rate limited, credential-free ──

func TestPublicIssuerRoutes(t *testing.T) {
	type hit struct{ path, method, cookie, auth string }
	var mu sync.Mutex
	var hits []hit
	issuer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		hits = append(hits, hit{r.URL.Path, r.Method, r.Header.Get("Cookie"), r.Header.Get("Authorization")})
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer issuer.Close()
	admin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("admin upstream reached for %s", r.URL.Path)
	}))
	defer admin.Close()

	cfg := testConfig(t, admin.URL)
	cfg.OAuthUpstream, _ = url.Parse(issuer.URL)
	cfg.PasswordResetRate = 2
	h := NewServer(cfg)

	// GET /api/version passes through.
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/version", nil))
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"ok":true`) {
		t.Fatalf("GET /api/version = %d %q", rr.Code, rr.Body.String())
	}
	// …but only GET.
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/version", nil))
	if rr.Code == http.StatusOK {
		t.Fatalf("POST /api/version was proxied")
	}

	// The password-reset posts pass through with browser credentials stripped.
	for _, p := range []string{"/api/auth/request-password-reset", "/api/auth/reset-password"} {
		rr = httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, p, strings.NewReader(`{"email":"a@example.com"}`))
		req.RemoteAddr = "127.0.0.1:5000"
		req.Header.Set("X-Forwarded-For", "203.0.113."+p[len(p)-1:])
		req.AddCookie(&http.Cookie{Name: "__Host-admin_session", Value: "sid"})
		req.Header.Set("Authorization", "Bearer stolen")
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("POST %s = %d %q", p, rr.Code, rr.Body.String())
		}
	}
	// Anything else under /api/auth is still 404.
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{}`)))
	if rr.Code != http.StatusNotFound {
		t.Fatalf("POST /api/auth/login = %d, want 404 (not allowlisted)", rr.Code)
	}

	mu.Lock()
	for _, x := range hits {
		if x.cookie != "" || x.auth != "" {
			t.Errorf("%s %s forwarded browser credentials: cookie=%q auth=%q", x.method, x.path, x.cookie, x.auth)
		}
	}
	mu.Unlock()

	// Per-IP budget on the mail-triggering posts.
	var last int
	for i := 0; i < 4; i++ {
		rr = httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/auth/request-password-reset", strings.NewReader(`{}`))
		req.RemoteAddr = "127.0.0.1:5000"
		req.Header.Set("X-Forwarded-For", "203.0.113.77")
		h.ServeHTTP(rr, req)
		last = rr.Code
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("4th password-reset post from one IP = %d, want 429", last)
	}
}
