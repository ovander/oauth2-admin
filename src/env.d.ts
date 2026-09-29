/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Admin API origin. Defaults to "" (same-origin) under the BFF model — the
   * SPA calls relative `/api/admin/*` and the BFF injects the bearer. May be set
   * to an absolute HTTPS origin for split-origin setups.
   */
  readonly VITE_ADMIN_API_URL?: string
  /**
   * Public OIDC issuer origin, used ONLY for the public pre-auth flows the BFF
   * does not proxy (forgot/reset password). Defaults to "" (same-origin / dev
   * proxy). HTTPS in production when set.
   */
  readonly VITE_OIDC_ISSUER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Injected by vite.config.ts define block at build time
declare const APP_VERSION:    string
declare const APP_BUILD_DATE: string
// Toolchain that built the console: Node.js (`process.version`, e.g. "v20.18.0")
// and Vite (e.g. "6.4.3").
declare const APP_BUILD_NODE: string
declare const APP_BUILD_VITE: string
