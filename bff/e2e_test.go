package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// TestEndToEndBrowserFlow drives the BFF the way a real browser does: a live
// http.Client with a cookie jar that FOLLOWS the login redirect chain through a
// mock issuer and back to the BFF callback. Unlike the handler-level tests in
// phase2_test.go (which pass cookies between httptest.Recorder calls by hand),
// this exercises real cookie propagation, redirect following, and the session
// cookie's wire behaviour against running servers.
func TestEndToEndBrowserFlow(t *testing.T) {
	// ── Mock admin API (loopback upstream) ──────────────────────────────────────
	// Asserts the BFF injected a bearer and stripped the session cookie.
	var sawBearer, sawCookie string
	admin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawBearer = r.Header.Get("Authorization")
		sawCookie = r.Header.Get("Cookie")
		if sawBearer == "" {
			http.Error(w, "no bearer", http.StatusUnauthorized)
			return
		}
		_, _ = io.WriteString(w, "admin-ok")
	}))
	defer admin.Close()

	accessJWT := makeJWT(map[string]any{"sub": "u1", "email": "a@example.com", "name": "Admin"})

	// ── Mock Socrate issuer ─────────────────────────────────────────────────────
	// /oauth/authorize auto-approves and 302s back to redirect_uri with code+state
	// (simulating the user authenticating on the hosted login); /oauth/token mints
	// a JWT access token.
	issuer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/oauth/authorize":
			q := r.URL.Query()
			back := q.Get("redirect_uri") + "?code=auth-code&state=" + url.QueryEscape(q.Get("state"))
			http.Redirect(w, r, back, http.StatusFound)
		case "/oauth/token":
			_ = r.ParseForm()
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": accessJWT, "refresh_token": "r1",
				"token_type": "Bearer", "expires_in": 300,
				"roles": []string{"super_admin"},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer issuer.Close()

	adminURL, _ := url.Parse(admin.URL)
	issURL, _ := url.Parse(issuer.URL)

	cfg := &Config{
		ListenAddr:      "127.0.0.1:0",
		AdminUpstream:   adminURL,
		ClientID:        "admin-console",
		ClientSecret:    "secret",
		OAuthUpstream:   issURL,     // back-channel token endpoint (loopback)
		OAuthPublicURL:  issuer.URL, // browser-facing authorize base
		Scopes:          "openid profile email",
		SessionIdle:     30 * time.Minute,
		SessionAbsolute: 8 * time.Hour,
		CookieSecure:    false, // http httptest → the jar must re-send the cookie
	}
	a := newApp(cfg)
	bff := httptest.NewServer(a.handler())
	defer bff.Close()
	// redirect_uri = PublicOrigin + /bff/callback → point it at the BFF itself so
	// the issuer redirects the browser back to us.
	cfg.PublicOrigin = bff.URL
	bffURL, _ := url.Parse(bff.URL)

	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}

	// ── 1. Login: follow /bff/login → issuer authorize → /bff/callback → return_to.
	// The final hop lands on the BFF catch-all (the SPA route doesn't exist here),
	// so we don't assert its status — only that the session cookie was minted.
	resp, err := client.Get(bff.URL + "/bff/login?return_to=/apps")
	if err != nil {
		t.Fatalf("login chain: %v", err)
	}
	resp.Body.Close()

	cookies := jar.Cookies(bffURL)
	if len(cookies) == 0 || cookies[0].Name != a.cookieName() {
		t.Fatalf("no session cookie after login: %+v", cookies)
	}

	// ── 2. /bff/session: the jar carries the cookie; expect identity + csrf. ─────
	resp, err = client.Get(bff.URL + "/bff/session")
	if err != nil {
		t.Fatalf("session: %v", err)
	}
	var sess struct {
		Authenticated bool     `json:"authenticated"`
		User          UserInfo `json:"user"`
		CSRF          string   `json:"csrf"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&sess)
	resp.Body.Close()
	if !sess.Authenticated || sess.User.Email != "a@example.com" || sess.CSRF == "" {
		t.Fatalf("session = %+v", sess)
	}
	if !hasAll(sess.User.Roles, "super_admin") {
		t.Errorf("roles = %v, want super_admin", sess.User.Roles)
	}

	// ── 3. GET /api/admin/* : the BFF injects the bearer, strips the cookie. ─────
	resp, err = client.Get(bff.URL + "/api/admin/users")
	if err != nil {
		t.Fatalf("admin GET: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || string(body) != "admin-ok" {
		t.Fatalf("admin GET = %d %q", resp.StatusCode, body)
	}
	if sawBearer != "Bearer "+accessJWT {
		t.Errorf("upstream bearer = %q, want injected session token", sawBearer)
	}
	if sawCookie != "" {
		t.Errorf("session cookie leaked upstream: %q", sawCookie)
	}

	// ── 4. POST without CSRF → 403; with the session's CSRF token → 200. ─────────
	resp, err = client.Post(bff.URL+"/api/admin/apps", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatalf("POST no-csrf: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("POST without CSRF = %d, want 403", resp.StatusCode)
	}

	req, _ := http.NewRequest(http.MethodPost, bff.URL+"/api/admin/apps", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", sess.CSRF)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("POST with-csrf: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST with CSRF = %d, want 200", resp.StatusCode)
	}

	// ── 5. Logout → cookie cleared; the session no longer resolves. ──────────────
	req, _ = http.NewRequest(http.MethodPost, bff.URL+"/bff/logout", nil)
	req.Header.Set("X-CSRF-Token", sess.CSRF)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("logout: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("logout = %d, want 204", resp.StatusCode)
	}

	resp, err = client.Get(bff.URL + "/bff/session")
	if err != nil {
		t.Fatalf("session after logout: %v", err)
	}
	var after struct {
		Authenticated bool `json:"authenticated"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&after)
	resp.Body.Close()
	if after.Authenticated {
		t.Error("session still authenticated after logout")
	}
}
