package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

// randomToken returns nbytes of crypto-random data as an unpadded base64url
// string (used for code_verifier, state, session id and CSRF token).
func randomToken(nbytes int) (string, error) {
	b := make([]byte, nbytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// pkceChallenge is the S256 code_challenge for a verifier (RFC 7636).
func pkceChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// sanitizeReturnTo accepts only a same-site path (single leading slash) and
// rejects protocol-relative ("//"), backslash, and absolute URLs — preventing
// open redirects. Anything invalid falls back to "/".
func sanitizeReturnTo(raw string) string {
	if raw == "" || !strings.HasPrefix(raw, "/") {
		return "/"
	}
	if strings.HasPrefix(raw, "//") || strings.HasPrefix(raw, "/\\") {
		return "/"
	}
	return raw
}

// ── Pending logins (PKCE state) ───────────────────────────────────────────────

type pendingLogin struct {
	verifier string
	returnTo string
	created  time.Time
}

// loginStore holds in-flight logins keyed by state. Entries are single-use
// (deleted on take → CSRF defense for the callback) and TTL-bounded.
type loginStore struct {
	mu  sync.Mutex
	m   map[string]pendingLogin
	ttl time.Duration
}

func newLoginStore(ttl time.Duration) *loginStore {
	return &loginStore{m: make(map[string]pendingLogin), ttl: ttl}
}

func (l *loginStore) put(state string, p pendingLogin) {
	l.mu.Lock()
	l.m[state] = p
	l.mu.Unlock()
}

// take returns and DELETES the pending login for state. It returns false if the
// state is unknown or expired (both → reject the callback).
func (l *loginStore) take(state string) (pendingLogin, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	p, ok := l.m[state]
	if !ok {
		return pendingLogin{}, false
	}
	delete(l.m, state)
	if time.Since(p.created) > l.ttl {
		return pendingLogin{}, false
	}
	return p, true
}

func (l *loginStore) sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	for state, p := range l.m {
		if time.Since(p.created) > l.ttl {
			delete(l.m, state)
		}
	}
}

// ── Token endpoint client (back-channel) ──────────────────────────────────────

type tokenResponse struct {
	AccessToken  string              `json:"access_token"`
	RefreshToken string              `json:"refresh_token"`
	IDToken      string              `json:"id_token"`
	TokenType    string              `json:"token_type"`
	ExpiresIn    int                 `json:"expires_in"`
	Scope        string              `json:"scope"`
	Roles        []string            `json:"roles"`
	AppRoles     map[string][]string `json:"app_roles"`
}

type oauthClient struct {
	tokenURL     string
	clientID     string
	clientSecret string
	http         *http.Client
}

func newOAuthClient(upstream *url.URL, clientID, clientSecret string) *oauthClient {
	return &oauthClient{
		tokenURL:     strings.TrimRight(upstream.String(), "/") + "/oauth/token",
		clientID:     clientID,
		clientSecret: clientSecret,
		http:         &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *oauthClient) postForm(ctx context.Context, form url.Values) (*tokenResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var tr tokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return nil, fmt.Errorf("decode token response: %w", err)
	}
	if tr.AccessToken == "" {
		return nil, fmt.Errorf("token response missing access_token")
	}
	return &tr, nil
}

func (c *oauthClient) exchange(ctx context.Context, code, redirectURI, verifier string) (*tokenResponse, error) {
	f := url.Values{}
	f.Set("grant_type", "authorization_code")
	f.Set("code", code)
	f.Set("redirect_uri", redirectURI)
	f.Set("client_id", c.clientID)
	f.Set("code_verifier", verifier)
	if c.clientSecret != "" {
		f.Set("client_secret", c.clientSecret)
	}
	return c.postForm(ctx, f)
}

func (c *oauthClient) refresh(ctx context.Context, refreshToken string) (*tokenResponse, error) {
	f := url.Values{}
	f.Set("grant_type", "refresh_token")
	f.Set("refresh_token", refreshToken)
	f.Set("client_id", c.clientID)
	if c.clientSecret != "" {
		f.Set("client_secret", c.clientSecret)
	}
	return c.postForm(ctx, f)
}

// ── Identity derivation ───────────────────────────────────────────────────────

// jwtClaims base64url-decodes the JWT payload segment. The BFF does NOT verify
// the signature: the token comes from our own server over loopback, and the
// real security boundary is the HttpOnly session cookie — not client-side JWT
// validation. Returns nil on a malformed token.
func jwtClaims(token string) map[string]any {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return nil
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(payload, &m); err != nil {
		return nil
	}
	return m
}

// deriveUser builds the UserInfo from the token response + access-token claims.
// Roles are the union of: token-response `roles`, `app_roles[clientID]`, and the
// JWT `roles` claim.
func deriveUser(clientID string, tr *tokenResponse, claims map[string]any) UserInfo {
	u := UserInfo{
		Sub:   claimString(claims, "sub"),
		Email: claimString(claims, "email"),
		Name:  firstNonEmpty(claimString(claims, "name"), claimString(claims, "preferred_username")),
	}
	set := make(map[string]struct{})
	addRoles(set, tr.Roles)
	addRoles(set, tr.AppRoles[clientID])
	addRoles(set, claimStrings(claims, "roles"))
	if claims != nil {
		if ar, ok := claims["app_roles"].(map[string]any); ok {
			addRoles(set, anySliceToStrings(ar[clientID]))
		}
	}
	u.Roles = make([]string, 0, len(set))
	for r := range set {
		u.Roles = append(u.Roles, r)
	}
	sort.Strings(u.Roles)
	return u
}

func addRoles(set map[string]struct{}, roles []string) {
	for _, r := range roles {
		if r = strings.TrimSpace(r); r != "" {
			set[r] = struct{}{}
		}
	}
}

func claimString(claims map[string]any, key string) string {
	if claims == nil {
		return ""
	}
	if v, ok := claims[key].(string); ok {
		return v
	}
	return ""
}

func claimStrings(claims map[string]any, key string) []string {
	if claims == nil {
		return nil
	}
	return anySliceToStrings(claims[key])
}

func anySliceToStrings(v any) []string {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, e := range arr {
		if s, ok := e.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
