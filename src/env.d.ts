/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Admin resource-server origin (/api/admin/*). HTTPS in production. Required. */
  readonly VITE_ADMIN_API_URL: string
  /** OIDC issuer origin (authorize/token/refresh/logout). Defaults to VITE_ADMIN_API_URL. */
  readonly VITE_OIDC_ISSUER?: string
  /** Public OAuth client id registered for the admin console. */
  readonly VITE_OAUTH_CLIENT_ID?: string
  /** Space-delimited scopes requested at /oauth/authorize. */
  readonly VITE_OAUTH_SCOPES?: string
  /** App path the AS redirects back to (must match the registered redirect URI). */
  readonly VITE_OAUTH_REDIRECT_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Injected by vite.config.ts define block at build time
declare const APP_VERSION:    string
declare const APP_BUILD_DATE: string
