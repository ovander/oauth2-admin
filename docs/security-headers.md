# Security Headers Deployment Guide

This document describes the HTTP security headers that MUST be configured on the
reverse proxy (Nginx, Caddy, Apache, etc.) that serves the admin SPA.

These cannot be set from inside a Vite/Vue SPA; they must be set at the transport layer.

---

## Required Headers

### Content-Security-Policy (F-02)

```nginx
add_header Content-Security-Policy
  "default-src 'none';
   script-src  'self';
   style-src   'self' 'unsafe-inline';
   font-src    'self';
   connect-src 'self' https://your-admin-api-host;
   img-src     'self' data:;
   base-uri    'self';
   form-action 'self';
   frame-ancestors 'none';"
  always;
```

**Rollout strategy (recommended):**
1. Deploy with `Content-Security-Policy-Report-Only` and set `report-uri /csp-reports`.
2. Monitor violation reports for 1–2 weeks.
3. Promote to enforcing `Content-Security-Policy` once violations are resolved.

### X-Frame-Options (F-09)

```nginx
add_header X-Frame-Options "DENY" always;
```

### Additional Recommended Headers

```nginx
add_header X-Content-Type-Options   "nosniff"                           always;
add_header Referrer-Policy          "strict-origin-when-cross-origin"   always;
add_header Permissions-Policy       "geolocation=(), microphone=(), camera=()" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

---

## Complete Nginx Server Block Example

```nginx
server {
    listen 443 ssl http2;
    server_name admin.your-domain.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    root /var/www/oauth2-admin/dist;
    index index.html;

    # Security headers
    add_header Content-Security-Policy
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' https://your-admin-api-host; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
      always;
    add_header X-Frame-Options              "DENY"                              always;
    add_header X-Content-Type-Options       "nosniff"                           always;
    add_header Referrer-Policy              "strict-origin-when-cross-origin"   always;
    add_header Strict-Transport-Security    "max-age=63072000; includeSubDomains; preload" always;
    add_header Permissions-Policy           "geolocation=(), microphone=(), camera=()" always;

    # SPA fallback routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache hashed assets indefinitely
    location ~* \.(js|css|woff2|png|svg|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Never cache index.html
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }
}
```

---

## Caddy Example

```caddy
admin.your-domain.com {
    root * /var/www/oauth2-admin/dist
    file_server

    header {
        Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' https://your-admin-api-host; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    }

    try_files {path} /index.html
}
```
