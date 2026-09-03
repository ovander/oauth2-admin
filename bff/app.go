package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"github.com/ovander/backendkit/bff"
	"github.com/ovander/backendkit/socrate"
)

// app holds the BFF dependencies. In Phase 1 (store == nil) it is a pure
// pass-through proxy; setting BFF_CLIENT_ID enables Phase 2 (sessions/login).
type app struct {
	cfg        *Config
	adminProxy *httputil.ReverseProxy

	// Phase 2 (nil in Phase 1)
	store       bff.SessionStore
	cookie      bff.CookieConfig
	gateway     *bff.Gateway
	logins      *loginStore
	oauth       *oauthClient
	issuerProxy *httputil.ReverseProxy // authenticated issuer self-service (e.g. /api/profile)

	loginLimiter   *rateLimiter // per-IP budget for /bff/login
	elevateLimiter *rateLimiter // per-IP budget for /bff/elevate
}

func newApp(cfg *Config) *app {
	a := &app{cfg: cfg, adminProxy: bff.NewSingleHostProxy(cfg.AdminUpstream)}
	if cfg.Phase2Enabled() {
		a.store = bff.NewMemoryStore(cfg.SessionIdle, cfg.SessionAbsolute)
		a.cookie = bff.CookieConfig{Name: "admin_session", Secure: cfg.CookieSecure, MaxAge: int(cfg.SessionAbsolute.Seconds())}
		a.logins = newLoginStore(10 * time.Minute)
		a.oauth = newOAuthClient(cfg.OAuthUpstream, cfg.ClientID, cfg.ClientSecret)
		a.issuerProxy = bff.NewSingleHostProxy(cfg.OAuthUpstream)
		a.loginLimiter = newRateLimiter(cfg.LoginRate, rateWindow)
		a.elevateLimiter = newRateLimiter(cfg.ElevateRate, rateWindow)
		a.gateway = &bff.Gateway{
			Store:            a.store,
			Cookie:           a.cookie,
			Refresher:        tokenRefresherAdapter{a.oauth},
			// backendkit >= v1.11.0: the gateway is fail-closed by default
			// (DisableAuth zero value); Phase 2 is only constructed when enabled.
			AllowPassthrough: cfg.AllowPassthrough,
		}
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
		mux.HandleFunc("POST /bff/elevate", a.handleElevate)

		// Authenticated issuer self-service, allowlisted one route at a time so
		// the BFF never becomes an open proxy to the issuer. Profile read/update
		// live on the issuer (:8080), not the admin API.
		mux.HandleFunc("/api/profile", a.gateway.ProxyWithSession(a.issuerProxy))

		// Admin API: session→token injection via the shared gateway.
		mux.HandleFunc("/api/admin/", a.gateway.ProxyWithSession(a.adminProxy))
	} else {
		// Phase 1 (no sessions): pure pass-through.
		mux.Handle("/api/admin/", a.adminProxy)
	}

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
				a.loginLimiter.sweep()
				a.elevateLimiter.sweep()
			}
		}
	}()
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

// cookieName returns the on-the-wire session cookie name (with the __Host-
// prefix applied automatically when CookieSecure is set).
func (a *app) cookieName() string { return a.cookie.CookieName() }

// ── Handlers ──────────────────────────────────────────────────────────────────

func (a *app) handleLogin(w http.ResponseWriter, r *http.Request) {
	if a.rateLimited(w, r, a.loginLimiter) {
		return
	}
	returnTo := bff.SanitizeReturnTo(r.URL.Query().Get("return_to"))
	pkce := bff.NewPKCE()
	state := bff.RandomToken(32)
	a.logins.put(state, pendingLogin{verifier: pkce.Verifier, returnTo: returnTo, created: time.Now()})

	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", a.cfg.ClientID)
	q.Set("redirect_uri", a.redirectURI())
	q.Set("scope", a.cfg.Scopes)
	q.Set("state", state)
	q.Set("code_challenge", pkce.Challenge)
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

	sid := bff.RandomToken(32)
	csrf := bff.RandomToken(32)
	now := time.Now()
	ts := &socrate.TokenSet{
		AccessToken:  tr.AccessToken,
		RefreshToken: tr.RefreshToken,
		IDToken:      tr.IDToken,
		ExpiresIn:    tr.ExpiresIn,
	}
	user := deriveUser(a.cfg.ClientID, tr, jwtClaims(tr.AccessToken))
	s := bff.NewSession(sid, csrf, ts, user, now)
	a.store.Put(s)
	a.cookie.SetSession(w, sid)
	http.Redirect(w, r, pending.returnTo, http.StatusFound)
}

func (a *app) handleSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	s, ok := a.gateway.SessionFromRequest(r)
	if !ok {
		_ = json.NewEncoder(w).Encode(map[string]any{"authenticated": false})
		return
	}
	s.Touch(time.Now())
	a.store.Put(s)
	user, csrf := s.User(), s.CSRF()
	_ = json.NewEncoder(w).Encode(map[string]any{"authenticated": true, "user": user, "csrf": csrf})
}

func (a *app) handleLogout(w http.ResponseWriter, r *http.Request) {
	if s, ok := a.gateway.SessionFromRequest(r); ok {
		a.revokeSessionTokens(r.Context(), s)
		a.store.Delete(s.ID())
	}
	a.cookie.ClearSession(w)
	w.WriteHeader(http.StatusNoContent)
}

// revokeSessionTokens best-effort revokes the session's tokens at the issuer so
// they cannot be replayed after logout. Failures are logged and ignored — the
// local session is always cleared by the caller regardless.
func (a *app) revokeSessionTokens(ctx context.Context, s *bff.Session) {
	refresh, access := s.RefreshToken(), s.AccessToken()

	if refresh != "" {
		if err := a.oauth.revoke(ctx, refresh, "refresh_token"); err != nil {
			log.Printf("logout: revoke refresh token failed: %v", err)
		}
	}
	if access != "" {
		if err := a.oauth.revoke(ctx, access, "access_token"); err != nil {
			log.Printf("logout: revoke access token failed: %v", err)
		}
	}
}

// ── Session helpers ───────────────────────────────────────────────────────────

func (a *app) redirectURI() string { return a.cfg.PublicOrigin + "/bff/callback" }
