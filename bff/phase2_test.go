package main

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

// makeJWT builds a header.payload.sig token; the BFF only base64url-decodes the
// payload (it does not verify the signature).
func makeJWT(claims map[string]any) string {
	payload, _ := json.Marshal(claims)
	return "hdr." + base64.RawURLEncoding.EncodeToString(payload) + ".sig"
}

type capture struct {
	mu     sync.Mutex
	auth   string
	cookie string
	hits   int
}

func (c *capture) record(r *http.Request) {
	c.mu.Lock()
	c.auth, c.cookie, c.hits = r.Header.Get("Authorization"), r.Header.Get("Cookie"), c.hits+1
	c.mu.Unlock()
}
func (c *capture) get() (string, string, int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.auth, c.cookie, c.hits
}

// phase2Harness wires the BFF against a mock admin API and a mock Socrate token
// endpoint. The access token is a JWT carrying sub/email/roles.
func phase2Harness(t *testing.T) (http.Handler, *app, *capture, string, string) {
	t.Helper()

	accessJWT := makeJWT(map[string]any{
		"sub": "user-1", "email": "admin@example.com", "name": "Admin",
		"roles": []any{"jwt_role"},
	})

	// An elevated token distinguishable from the login token, with a future exp.
	elevatedJWT := makeJWT(map[string]any{
		"sub": "user-1", "email": "admin@example.com", "name": "Admin",
		"roles": []any{"jwt_role"}, "exp": float64(time.Now().Add(5 * time.Minute).Unix()),
	})

	cap := &capture{}
	admin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cap.record(r)
		// Step-up: require an MFA code; without it, challenge like the real server.
		if r.URL.Path == "/api/admin/elevate" {
			var in struct {
				Password string `json:"password"`
				MfaCode  string `json:"mfa_code"`
			}
			_ = json.NewDecoder(r.Body).Decode(&in)
			w.Header().Set("Content-Type", "application/json")
			if in.MfaCode == "" {
				w.WriteHeader(http.StatusUnauthorized)
				_ = json.NewEncoder(w).Encode(map[string]any{"error": "mfa_required"})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": elevatedJWT})
			return
		}
		_, _ = io.WriteString(w, "admin-ok")
	}))
	t.Cleanup(admin.Close)

	as := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Authenticated issuer self-service: echo back what the BFF forwarded so
		// the test can assert the injected bearer + stripped cookie.
		if r.URL.Path == "/api/profile" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"auth":   r.Header.Get("Authorization"),
				"cookie": r.Header.Get("Cookie"),
				"method": r.Method,
			})
			return
		}
		if r.URL.Path != "/oauth/token" {
			http.NotFound(w, r)
			return
		}
		_ = r.ParseForm()
		w.Header().Set("Content-Type", "application/json")
		switch r.Form.Get("grant_type") {
		case "authorization_code":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": accessJWT, "refresh_token": "refresh-1", "id_token": "id-1",
				"token_type": "Bearer", "expires_in": 300,
				"roles": []string{"super_admin"}, "app_roles": map[string][]string{"admin-console": {"console_admin"}},
			})
		case "refresh_token":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token": "refreshed-access", "refresh_token": "refresh-2",
				"token_type": "Bearer", "expires_in": 300,
			})
		default:
			http.Error(w, "unsupported_grant_type", http.StatusBadRequest)
		}
	}))
	t.Cleanup(as.Close)

	adminURL, _ := url.Parse(admin.URL)
	asURL, _ := url.Parse(as.URL)
	cfg := &Config{
		ListenAddr: "127.0.0.1:0", AdminUpstream: adminURL,
		ClientID: "admin-console", ClientSecret: "secret",
		OAuthUpstream: asURL, OAuthPublicURL: "https://as.example", PublicOrigin: "https://admin.example",
		Scopes: "openid profile email", SessionIdle: 30 * time.Minute, SessionAbsolute: 8 * time.Hour,
		CookieSecure: false,
	}
	a := newApp(cfg)
	return a.handler(), a, cap, accessJWT, elevatedJWT
}

func sessionCookie(t *testing.T, rr *httptest.ResponseRecorder, name string) *http.Cookie {
	t.Helper()
	for _, c := range rr.Result().Cookies() {
		if c.Name == name {
			return c
		}
	}
	t.Fatalf("cookie %q not set", name)
	return nil
}

func TestPhase2FullFlow(t *testing.T) {
	h, a, cap, accessJWT, _ := phase2Harness(t)
	name := a.cookieName()

	// 1. /bff/login → 302 to the AS authorize endpoint with PKCE params.
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/bff/login?return_to=/dashboard", nil))
	if rr.Code != http.StatusFound {
		t.Fatalf("login status = %d, want 302", rr.Code)
	}
	loc, _ := url.Parse(rr.Header().Get("Location"))
	if loc.Scheme+"://"+loc.Host+loc.Path != "https://as.example/oauth/authorize" {
		t.Fatalf("authorize URL = %s", loc)
	}
	q := loc.Query()
	if q.Get("response_type") != "code" || q.Get("client_id") != "admin-console" ||
		q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" ||
		q.Get("redirect_uri") != "https://admin.example/bff/callback" {
		t.Fatalf("bad authorize params: %v", q)
	}
	state := q.Get("state")

	// 2. /bff/callback → exchanges code, sets session cookie, 302 to return_to.
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/bff/callback?code=abc&state="+state, nil))
	if rr.Code != http.StatusFound || rr.Header().Get("Location") != "/dashboard" {
		t.Fatalf("callback = %d %q, want 302 /dashboard", rr.Code, rr.Header().Get("Location"))
	}
	cookie := sessionCookie(t, rr, name)
	if cookie.Value == "" || !cookie.HttpOnly || cookie.SameSite != http.SameSiteStrictMode {
		t.Fatalf("session cookie weak: %+v", cookie)
	}

	// 3. /bff/session → identity + csrf.
	rr = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/bff/session", nil)
	req.AddCookie(cookie)
	h.ServeHTTP(rr, req)
	var sess struct {
		Authenticated bool     `json:"authenticated"`
		User          UserInfo `json:"user"`
		CSRF          string   `json:"csrf"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &sess)
	if !sess.Authenticated || sess.User.Sub != "user-1" || sess.User.Email != "admin@example.com" {
		t.Fatalf("session = %+v", sess)
	}
	if !hasAll(sess.User.Roles, "super_admin", "console_admin", "jwt_role") {
		t.Fatalf("roles = %v, want merged from body+app_roles+jwt", sess.User.Roles)
	}
	if sess.CSRF == "" {
		t.Fatal("csrf empty")
	}

	// 4. GET /api/admin/* → upstream gets the injected bearer, NOT the cookie.
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.AddCookie(cookie)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("admin GET = %d", rr.Code)
	}
	gotAuth, gotCookie, _ := cap.get()
	if gotAuth != "Bearer "+accessJWT {
		t.Errorf("upstream auth = %q, want injected session token", gotAuth)
	}
	if gotCookie != "" {
		t.Errorf("session cookie leaked upstream: %q", gotCookie)
	}

	// 5. POST without CSRF → 403; with CSRF → proxied.
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/admin/apps", nil)
	req.AddCookie(cookie)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("POST without CSRF = %d, want 403", rr.Code)
	}
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/admin/apps", nil)
	req.AddCookie(cookie)
	req.Header.Set("X-CSRF-Token", sess.CSRF)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("POST with CSRF = %d, want 200", rr.Code)
	}

	// 6. /bff/logout → clears the cookie; session no longer resolves.
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/bff/logout", nil)
	req.AddCookie(cookie)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("logout = %d, want 204", rr.Code)
	}
	cleared := sessionCookie(t, rr, name)
	if cleared.MaxAge >= 0 {
		t.Errorf("logout cookie MaxAge = %d, want < 0", cleared.MaxAge)
	}
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/bff/session", nil)
	req.AddCookie(cookie)
	h.ServeHTTP(rr, req)
	if strings.Contains(rr.Body.String(), `"authenticated":true`) {
		t.Errorf("session still authenticated after logout: %s", rr.Body.String())
	}
}

func TestUnknownStateRejected(t *testing.T) {
	h, _, _, _, _ := phase2Harness(t)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/bff/callback?code=abc&state=forged", nil))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("forged state = %d, want 400", rr.Code)
	}
}

func TestDualModePassThrough(t *testing.T) {
	h, _, cap, _, _ := phase2Harness(t)
	// No session cookie → the browser's own bearer is forwarded unchanged.
	req := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.Header.Set("Authorization", "Bearer browser-token")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d", rr.Code)
	}
	if gotAuth, _, _ := cap.get(); gotAuth != "Bearer browser-token" {
		t.Errorf("upstream auth = %q, want pass-through", gotAuth)
	}
}

func TestProactiveRefresh(t *testing.T) {
	h, a, cap, _, _ := phase2Harness(t)
	// Inject a session whose access token is within 30s of expiry.
	sid, _ := randomToken(16)
	now := time.Now()
	a.store.Put(&Session{
		ID: sid, AccessToken: "stale", RefreshToken: "refresh-1",
		AccessExpiry: now.Add(5 * time.Second), CSRF: "c", Created: now, LastSeen: now,
		User: UserInfo{Sub: "user-1"},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/admin/x", nil)
	req.AddCookie(&http.Cookie{Name: a.cookieName(), Value: sid})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if gotAuth, _, _ := cap.get(); gotAuth != "Bearer refreshed-access" {
		t.Errorf("upstream auth = %q, want refreshed token injected", gotAuth)
	}
}

func TestElevation(t *testing.T) {
	h, a, cap, accessJWT, elevatedJWT := phase2Harness(t)
	// Seed a logged-in session with a known CSRF token.
	sid, _ := randomToken(16)
	now := time.Now()
	a.store.Put(&Session{
		ID: sid, AccessToken: accessJWT, RefreshToken: "refresh-1",
		AccessExpiry: now.Add(5 * time.Minute), CSRF: "csrf-1", Created: now, LastSeen: now,
		User: UserInfo{Sub: "user-1"},
	})
	cookie := &http.Cookie{Name: a.cookieName(), Value: sid}

	// Missing CSRF → 403, no upstream call.
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/bff/elevate", strings.NewReader(`{"password":"pw","mfa_code":"123456"}`))
	req.AddCookie(cookie)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("elevate without csrf = %d, want 403", rr.Code)
	}

	// Without MFA → upstream challenges; the BFF forwards 401 mfa_required verbatim.
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/bff/elevate", strings.NewReader(`{"password":"pw"}`))
	req.AddCookie(cookie)
	req.Header.Set("X-CSRF-Token", "csrf-1")
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized || !strings.Contains(rr.Body.String(), "mfa_required") {
		t.Fatalf("elevate without mfa = %d %q, want 401 mfa_required", rr.Code, rr.Body.String())
	}

	// With MFA + CSRF → 204; the elevated token is absorbed into the session.
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/bff/elevate", strings.NewReader(`{"password":"pw","mfa_code":"123456"}`))
	req.AddCookie(cookie)
	req.Header.Set("X-CSRF-Token", "csrf-1")
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("elevate = %d, want 204 (body %q)", rr.Code, rr.Body.String())
	}

	// A subsequent admin call now injects the ELEVATED token, not the original.
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/admin/x", nil)
	req.AddCookie(cookie)
	h.ServeHTTP(rr, req)
	if gotAuth, _, _ := cap.get(); gotAuth != "Bearer "+elevatedJWT {
		t.Errorf("after elevate upstream auth = %q, want elevated token", gotAuth)
	}
}

func TestIssuerProfileProxy(t *testing.T) {
	h, a, _, accessJWT, _ := phase2Harness(t)
	// Seed a logged-in session with a known CSRF token.
	sid, _ := randomToken(16)
	now := time.Now()
	a.store.Put(&Session{
		ID: sid, AccessToken: accessJWT, RefreshToken: "refresh-1",
		AccessExpiry: now.Add(5 * time.Minute), CSRF: "csrf-1", Created: now, LastSeen: now,
		User: UserInfo{Sub: "user-1"},
	})
	cookie := &http.Cookie{Name: a.cookieName(), Value: sid}

	// GET /api/profile → injected bearer reaches the issuer; cookie stripped.
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req.AddCookie(cookie)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET /api/profile = %d, want 200", rr.Code)
	}
	var got struct{ Auth, Cookie, Method string }
	_ = json.Unmarshal(rr.Body.Bytes(), &got)
	if got.Auth != "Bearer "+accessJWT {
		t.Errorf("issuer auth = %q, want injected session bearer", got.Auth)
	}
	if got.Cookie != "" {
		t.Errorf("session cookie leaked to the issuer: %q", got.Cookie)
	}

	// PUT without CSRF → 403; with CSRF → proxied.
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPut, "/api/profile", strings.NewReader(`{"name":"x"}`))
	req.AddCookie(cookie)
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("PUT without CSRF = %d, want 403", rr.Code)
	}
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPut, "/api/profile", strings.NewReader(`{"name":"x"}`))
	req.AddCookie(cookie)
	req.Header.Set("X-CSRF-Token", "csrf-1")
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("PUT with CSRF = %d, want 200", rr.Code)
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &got)
	if got.Method != http.MethodPut {
		t.Errorf("issuer saw method %q, want PUT", got.Method)
	}
}

func hasAll(have []string, want ...string) bool {
	set := make(map[string]bool, len(have))
	for _, h := range have {
		set[h] = true
	}
	for _, w := range want {
		if !set[w] {
			return false
		}
	}
	return true
}
