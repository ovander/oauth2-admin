package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/ovander/backendkit/bff"
	"github.com/ovander/backendkit/socrate"
)

// The console's own token client must surface a rejected grant as a typed
// *socrate.OAuthError, otherwise bff.IsFatalRefreshError can never fire and a
// session whose refresh token was revoked would 502 forever instead of being
// torn down (P3-12 adoption).
func TestRefreshErrorsAreTypedForIsFatalRefreshError(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		fatal  bool
		code   string
	}{
		{"invalid_grant", http.StatusBadRequest, `{"error":"invalid_grant","error_description":"revoked"}`, true, "invalid_grant"},
		{"invalid_client", http.StatusUnauthorized, `{"error":"invalid_client"}`, true, "invalid_client"},
		{"5xx outage", http.StatusServiceUnavailable, `upstream down`, false, ""},
		{"non-JSON 400", http.StatusBadRequest, `bad request`, false, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(c.status)
				_, _ = w.Write([]byte(c.body))
			}))
			defer srv.Close()
			u, _ := url.Parse(srv.URL)
			oc := newOAuthClient(u, "admin-console", "s3cret")

			_, err := tokenRefresherAdapter{oc}.RefreshToken(context.Background(), "rt")
			if err == nil {
				t.Fatal("want error")
			}
			var oe *socrate.OAuthError
			if !errors.As(err, &oe) {
				t.Fatalf("error is %T (%v), want *socrate.OAuthError", err, err)
			}
			if oe.StatusCode != c.status || oe.Code != c.code {
				t.Fatalf("OAuthError = %+v, want status %d code %q", oe, c.status, c.code)
			}
			if got := bff.IsFatalRefreshError(err); got != c.fatal {
				t.Fatalf("IsFatalRefreshError = %v, want %v", got, c.fatal)
			}
		})
	}
}
