/**
 * The app's Trusted Types `default` policy (see docs/security-headers.md).
 *
 * Under `require-trusted-types-for 'script'` a plain string written to an HTML
 * sink is routed through the `default` policy, and throws when there is none.
 * Vue brings its own `vue` policy; the only raw sink the built app reaches is
 * PrimeVue's Tooltip directive, which clears a freshly created element with
 * `innerHTML = ''` before it adds the text as a text node.
 *
 * This policy is REJECTING, never a pass-through: it lets the empty string
 * through (clearing an element injects nothing) and refuses every other HTML,
 * script and script-URL value, so the sink throws and the browser reports the
 * violation. A future sink that genuinely needs HTML gets a named, sanitising
 * policy of its own, not a wider default.
 */

/** Minimal shape of the browser's `window.trustedTypes` factory (not in lib.dom). */
export interface TrustedTypesFactory {
  createPolicy(
    name: string,
    rules: {
      createHTML?: (input: string) => string | null
      createScript?: (input: string) => string | null
      createScriptURL?: (input: string) => string | null
    },
  ): unknown
}

/** Name of the policy; `trusted-types` in csp.ts must list it. */
export const DEFAULT_POLICY_NAME = 'default'

/**
 * `createHTML` of the default policy: the empty string passes, anything else is
 * refused (`null` makes the sink assignment throw and report).
 */
export function defaultPolicyCreateHTML(input: string): string | null {
  return input === '' ? '' : null
}

/** `createScript` / `createScriptURL` of the default policy: always refused. */
export function defaultPolicyReject(): null {
  return null
}

/**
 * Create the `default` policy once, at start-up, so nothing else can claim the
 * name. Returns true when the policy was created; false when the browser has no
 * Trusted Types, or the page's CSP does not allow a policy named `default` (the
 * sinks then stay fail-closed: a raw string throws).
 */
export function installDefaultTrustedTypesPolicy(
  factory: TrustedTypesFactory | undefined = (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes,
): boolean {
  if (!factory) return false
  try {
    factory.createPolicy(DEFAULT_POLICY_NAME, {
      createHTML:      defaultPolicyCreateHTML,
      createScript:    defaultPolicyReject,
      createScriptURL: defaultPolicyReject,
    })
    return true
  } catch {
    return false
  }
}
