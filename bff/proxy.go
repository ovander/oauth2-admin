package main

import (
	"net/http/httputil"
	"net/url"
)

// newReverseProxy builds an SSE-aware reverse proxy to an upstream.
//
// FlushInterval = -1 flushes each write immediately, so Server-Sent Events (the
// security event stream) and other streaming responses are not buffered.
//
// The default director forwards the incoming request to the upstream, joining
// the upstream path with the request path. Callers mount it behind an allowlist
// (see app.go) and inject/strip auth headers before serving. Path cleaning is
// handled by the ServeMux, so no "/api/admin/../x" traversal can reach the
// upstream (see server.go).
func newReverseProxy(upstream *url.URL) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	proxy.FlushInterval = -1
	return proxy
}
