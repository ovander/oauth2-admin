package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"
)

// app holds the BFF dependencies. In Phase 1 (store == nil) it is a pure
// pass-through proxy; setting BFF_CLIENT_ID enables Phase 2 (sessions/login).
type app struct {
	cfg        *Config
	adminProxy *httputil.ReverseProxy

	// Phase 2 (nil in Phase 1)
	store  SessionStore
	logins *loginStore
	oauth  *oauthClient
}

func newApp(cfg *Config) *app {
	a := &app{cfg: cfg, adminProxy: newAdminProxy(cfg.AdminUpstream)}
	if cfg.Phase2Enabled() {
		a.store = newMemStore(cfg.SessionIdle, cfg.SessionAbsolute)
		a.logins = newLoginStore(10 * time.Minute)
		a.oauth = newOAuthClient(cfg.OAuthUpstream, cfg.ClientID, cfg.ClientSecret)
	}
	return a
}

// handler builds the HTTP routing. The admin proxy and healthz are always
// present; the session endpoints are added only in Phase 2.
func (a *app) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /bff/healthz", handleHealthz)

	if a.store != nil {
		mux.HandleFunc("GET /bff/login", a.handleLogin)
		mux.HandleFunc("GET /bff/callback", a.handleCallback)
		mux.HandleFunc("GET /bff/session", a.handleSession)
		mux.HandleFunc("POST /bff/logout", a.handleLogout)
	}

	// Admin API: session→token injection in Phase 2, pass-through otherwise.
	mux.HandleFunc("/api/admin/", a.handleAdminProxy)

	// Allowlist: everything else is 404 — never an open proxy.
	mux.HandleFunc("/", http.NotFound)
	return mux
}

// startBackground runs the expiry sweepers until ctx is cancelled (Phase 2).
func (a *app) startBackground(ctx context.Context) {
	if a.store == nil {
		return
	}
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				a.store.Sweep()
				a.logins.sweep()
			}
		}
	}()
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

func (a *app) cookieName() string {
	if a.cfg.CookieSecure {
		return "__Host-admin_session"
	}
	return "admin_session"
}

func (a *app) setSessionCookie(w http.ResponseWriter, id string) {
	http.SetCookie(w, &http.Cookie{
		Name:     a.cookieName(),
		Value:    id,
		Path:     "/",
		HttpOnly: true,
		Secure:   a.cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(a.cfg.SessionAbsolute.Seconds()),
	})
}

func (a *app) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     a.cookieName(),
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   a.cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
}

func (a *app) sessionFromRequest(r *http.Request) (*Session, bool) {
	c, err := r.Cookie(a.cookieName())
	if err != nil || c.Value == "" {
		return nil, false
	}
	return a.store.Get(c.Value)
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (a *app) handleLogin(w http.ResponseWriter, r *http.Request) {
	returnTo := sanitizeReturnTo(r.URL.Query().Get("return_to"))
	verifier, err := randomToken(32)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	state, err := randomToken(32)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	a.logins.put(state, pendingLogin{verifier: verifier, returnTo: returnTo, created: time.Now()})

	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", a.cfg.ClientID)
	q.Set("redirect_uri", a.redirectURI())
	q.Set("scope", a.cfg.Scopes)
	q.Set("state", state)
	q.Set("code_challenge", pkceChallenge(verifier))
	q.Set("code_challenge_method", "S256")
	http.Redirect(w, r, a.cfg.OAuthPublicURL+"/oauth/authorize?"+q.Encode(), http.StatusFound)
}

func (a *app) handleCallback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if e := q.Get("error"); e != "" {
		http.Error(w, "authorization failed: "+e, http.StatusBadRequest)
		return
	}
	// Single-use state: take+delete is the CSRF defense for the callback.
	pending, ok := a.logins.take(q.Get("state"))
	if !ok {
		http.Error(w, "invalid or expired state", http.StatusBadRequest)
		return
	}
	code := q.Get("code")
	if code == "" {
		http.Error(w, "missing authorization code", http.StatusBadRequest)
		return
	}

	tr, err := a.oauth.exchange(r.Context(), code, a.redirectURI(), pending.verifier)
	if err != nil {
		http.Error(w, "token exchange failed", http.StatusBadGateway)
		return
	}

	sid, err := randomToken(32)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	csrf, err := randomToken(32)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	now := time.Now()
	s := &Session{
		ID:           sid,
		AccessToken:  tr.AccessToken,
		RefreshToken: tr.RefreshToken,
		IDToken:      tr.IDToken,
		AccessExpiry: now.Add(time.Duration(tr.ExpiresIn) * time.Second),
		CSRF:         csrf,
		Created:      now,
		LastSeen:     now,
		User:         deriveUser(a.cfg.ClientID, tr, jwtClaims(tr.AccessToken)),
	}
	a.store.Put(s)
	a.setSessionCookie(w, sid)
	http.Redirect(w, r, pending.returnTo, http.StatusFound)
}

func (a *app) handleSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	s, ok := a.sessionFromRequest(r)
	if !ok {
		_ = json.NewEncoder(w).Encode(map[string]any{"authenticated": false})
		return
	}
	a.touch(s)
	s.mu.Lock()
	user, csrf := s.User, s.CSRF
	s.mu.Unlock()
	_ = json.NewEncoder(w).Encode(map[string]any{"authenticated": true, "user": user, "csrf": csrf})
}

func (a *app) handleLogout(w http.ResponseWriter, r *http.Request) {
	if s, ok := a.sessionFromRequest(r); ok {
		a.store.Delete(s.ID)
	}
	a.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) handleAdminProxy(w http.ResponseWriter, r *http.Request) {
	// Phase 1 (no sessions): pure pass-through.
	if a.store == nil {
		a.adminProxy.ServeHTTP(w, r)
		return
	}

	s, ok := a.sessionFromRequest(r)
	if !ok {
		// Dual mode: no session → forward the browser's request unchanged, so
		// the BFF can deploy before the SPA switches to cookies.
		a.adminProxy.ServeHTTP(w, r)
		return
	}

	// CSRF: double-submit on state-changing methods (defense in depth on top of
	// SameSite=Strict).
	if isUnsafeMethod(r.Method) {
		s.mu.Lock()
		want := s.CSRF
		s.mu.Unlock()
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(want)) != 1 {
			http.Error(w, "missing or invalid CSRF token", http.StatusForbidden)
			return
		}
	}

	access, err := a.ensureFresh(r.Context(), s)
	if err != nil {
		a.store.Delete(s.ID)
		a.clearSessionCookie(w)
		http.Error(w, "session expired", http.StatusUnauthorized)
		return
	}
	a.touch(s)

	r.Header.Set("Authorization", "Bearer "+access)
	r.Header.Del("Cookie") // never leak the session cookie to the upstream admin API
	a.adminProxy.ServeHTTP(w, r)
}

// ── Session helpers ───────────────────────────────────────────────────────────

func (a *app) redirectURI() string { return a.cfg.PublicOrigin + "/bff/callback" }

// touch slides the idle window.
func (a *app) touch(s *Session) {
	s.mu.Lock()
	s.LastSeen = time.Now()
	s.mu.Unlock()
	a.store.Put(s)
}

// ensureFresh returns the session's access token, proactively refreshing it when
// it is within 30s of expiry. The per-session lock serialises concurrent
// refreshes so the rotating refresh token is used once.
func (a *app) ensureFresh(ctx context.Context, s *Session) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Now().Add(30 * time.Second).Before(s.AccessExpiry) {
		return s.AccessToken, nil
	}
	tr, err := a.oauth.refresh(ctx, s.RefreshToken)
	if err != nil {
		return "", err
	}
	s.AccessToken = tr.AccessToken
	if tr.RefreshToken != "" {
		s.RefreshToken = tr.RefreshToken
	}
	if tr.IDToken != "" {
		s.IDToken = tr.IDToken
	}
	s.AccessExpiry = time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second)
	return s.AccessToken, nil
}

func isUnsafeMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	default:
		return true
	}
}
