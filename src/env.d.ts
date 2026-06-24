/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Socrate API gateway (HTTPS in production). Required. */
  readonly VITE_ADMIN_API_URL: string
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
