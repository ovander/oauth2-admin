package main

import (
	"net/http/httputil"
	"net/url"
)

// newAdminProxy builds an SSE-aware reverse proxy to the admin API upstream.
//
// FlushInterval = -1 flushes each write immediately, so Server-Sent Events (the
// security event stream) and other streaming responses are not buffered.
//
// The default director forwards the incoming request — including the browser's
// Authorization header — to the upstream, joining the upstream path with the
// request path. The admin API serves the same /api/admin/* prefix, so paths pass
// through unchanged. Path cleaning is handled upstream by the ServeMux, so no
// "/api/admin/../x" traversal can reach the upstream (see server.go).
func newAdminProxy(upstream *url.URL) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	proxy.FlushInterval = -1
	return proxy
}
