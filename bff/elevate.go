package main

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
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
	s, ok := a.sessionFromRequest(r)
	if !ok {
		http.Error(w, "no session", http.StatusUnauthorized)
		return
	}

	// CSRF: double-submit, constant-time — same defense as the admin proxy.
	s.mu.Lock()
	want := s.CSRF
	s.mu.Unlock()
	if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(want)) != 1 {
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
	access, err := a.ensureFresh(r.Context(), s)
	if err != nil {
		a.store.Delete(s.ID)
		a.clearSessionCookie(w)
		http.Error(w, "session expired", http.StatusUnauthorized)
		return
	}

	status, elevated, body, err := a.oauth.elevate(r.Context(), a.cfg.AdminUpstream, access, in.Password, in.MfaCode)
	if err != nil {
		http.Error(w, "elevation upstream error", http.StatusBadGateway)
		return
	}
	if status != http.StatusOK {
		// Forward the upstream challenge (e.g. {"error":"mfa_required"}) verbatim.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write(body)
		return
	}

	// Absorb the elevated access token into the session. Its lifetime comes from
	// the token's own `exp` claim; the refresh token is unchanged, so the session
	// naturally drops back to the non-elevated level once it expires.
	s.mu.Lock()
	s.AccessToken = elevated
	if claims := jwtClaims(elevated); claims != nil {
		if exp, ok := claims["exp"].(float64); ok {
			s.AccessExpiry = time.Unix(int64(exp), 0)
		}
	}
	s.mu.Unlock()
	a.store.Put(s)

	w.WriteHeader(http.StatusNoContent)
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
