package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/ovander/backendkit/bff"
	"github.com/ovander/backendkit/socrate"
)

// handleElevate performs server-side step-up (re-authentication) for sensitive
// admin actions. The SPA posts the password (+ optional MFA code) here; the BFF
// calls the admin resource server's /api/admin/elevate with the session's
// current bearer, then ABSORBS the returned short-lived elevated token into the
// session so subsequent /api/admin/* calls are automatically elevated. The
// elevated token never reaches the browser — same boundary as the rest of the
// BFF model.
//
// Upstream errors (mfa_required / invalid mfa code) are forwarded verbatim so
// the SPA's step-up dialog can re-prompt.
func (a *app) handleElevate(w http.ResponseWriter, r *http.Request) {
	if a.rateLimited(w, r, a.elevateLimiter) {
		return
	}
	s, ok := a.gateway.SessionFromRequest(r)
	if !ok {
		http.Error(w, "no session", http.StatusUnauthorized)
		return
	}

	// CSRF: double-submit, constant-time — same defense as the admin proxy.
	// P2-12: the header name comes from the shared gateway, not a local literal.
	if !s.MatchCSRF(r.Header.Get(bff.DefaultCSRFHeader)) {
		http.Error(w, "missing or invalid CSRF token", http.StatusForbidden)
		return
	}

	var in struct {
		Password string `json:"password"`
		MfaCode  string `json:"mfa_code"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Use a fresh (proactively refreshed) bearer for the upstream elevate call.
	// Same policy as the shared proxy: only a refresh the issuer REJECTS kills
	// the session; a transient token-endpoint failure is a 502 the SPA can retry.
	access, err := a.gateway.EnsureFresh(r.Context(), s)
	if err != nil {
		if bff.IsFatalRefreshError(err) {
			a.store.Delete(s.ID())
			a.cookie.ClearSession(w)
			http.Error(w, "session expired", http.StatusUnauthorized)
			return
		}
		http.Error(w, "token refresh unavailable", http.StatusBadGateway)
		return
	}

	status, elevated, body, err := a.oauth.elevate(r.Context(), a.cfg.AdminUpstream, access, in.Password, in.MfaCode)
	if err != nil {
		http.Error(w, "elevation upstream error", http.StatusBadGateway)
		return
	}
	if status != http.StatusOK {
		// P3-21: forward only a 4xx challenge (e.g. {"error":"mfa_required"},
		// invalid code) so the SPA's step-up dialog can re-prompt. Anything else
		// is an upstream fault whose body (stack traces, proxy pages) must not
		// reach the browser.
		if status >= 400 && status < 500 {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(status)
			_, _ = w.Write(body)
			return
		}
		log.Printf("elevate: admin upstream returned %d", status)
		http.Error(w, "elevation upstream error", http.StatusBadGateway)
		return
	}

	// Absorb the elevated access token into the session. Its lifetime comes from
	// the token's own `exp` claim; the refresh token is unchanged, so the session
	// naturally drops back to the non-elevated level once it expires.
	//
	// P2-11: fail closed. A token with no parseable `exp`, or one already
	// expired, used to be stored with ExpiresIn=0 — an access token the gateway
	// treats as permanently stale, so the very next proxied call forces a refresh
	// that throws the elevation away, or worse, poisons the session. Refuse it.
	expiresIn := elevatedTokenTTL(elevated, time.Now())
	if expiresIn <= 0 {
		log.Printf("elevate: upstream token has no usable exp claim; not absorbing")
		http.Error(w, "elevation upstream error", http.StatusBadGateway)
		return
	}
	s.SetTokens(&socrate.TokenSet{AccessToken: elevated, ExpiresIn: expiresIn}, time.Now())
	a.store.Put(s)

	w.WriteHeader(http.StatusNoContent)
}

// elevatedTokenTTL returns the remaining lifetime, in whole seconds, of the JWT
// according to its `exp` claim, or 0 when the claim is absent, malformed or in
// the past.
func elevatedTokenTTL(token string, now time.Time) int {
	claims := jwtClaims(token)
	if claims == nil {
		return 0
	}
	exp, ok := claims["exp"].(float64)
	if !ok || exp <= 0 {
		return 0
	}
	ttl := int(time.Unix(int64(exp), 0).Sub(now).Seconds())
	if ttl < 0 {
		return 0
	}
	return ttl
}

// elevate calls the admin resource server's step-up endpoint with the session
// bearer. On 200 it returns the new access_token; on any other status it returns
// the status + raw body so the caller can forward the challenge to the SPA.
func (c *oauthClient) elevate(ctx context.Context, adminUpstream *url.URL, bearer, password, mfaCode string) (status int, accessToken string, body []byte, err error) {
	payload := map[string]string{"password": password}
	if mfaCode != "" {
		payload["mfa_code"] = mfaCode
	}
	buf, _ := json.Marshal(payload)

	endpoint := strings.TrimRight(adminUpstream.String(), "/") + "/api/admin/elevate"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(buf))
	if err != nil {
		return 0, "", nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+bearer)

	resp, err := c.http.Do(req)
	if err != nil {
		return 0, "", nil, err
	}
	defer resp.Body.Close()
	body, _ = io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	if resp.StatusCode == http.StatusOK {
		var tr struct {
			AccessToken string `json:"access_token"`
		}
		if err := json.Unmarshal(body, &tr); err != nil || tr.AccessToken == "" {
			return resp.StatusCode, "", body, fmt.Errorf("elevate response missing access_token")
		}
		return resp.StatusCode, tr.AccessToken, body, nil
	}
	return resp.StatusCode, "", body, nil
}
