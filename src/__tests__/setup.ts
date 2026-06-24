/**
 * Global Vitest setup — runs before every test file.
 *
 * Responsibilities:
 *  - Start/stop the MSW Node server so HTTP calls are intercepted in all tests
 *  - Configure @vue/test-utils globals (stubs, plugins)
 *  - Provide lightweight PrimeVue component stubs so component tests
 *    never need a full PrimeVue installation
 *  - Silence noisy console output during tests
 */
import { config } from '@vue/test-utils'
import { vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { server } from './msw/server'

// ─── MSW server lifecycle ─────────────────────────────────────────────────────
// 'warn' on unhandled requests keeps unit tests (which never hit HTTP) silent.
// Integration tests that need strict mode add their own handlers with error-level.
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())   // restore defaults after overrides
afterAll(() => server.close())

// ─── PrimeVue component stubs ─────────────────────────────────────────────────
// These thin stubs render just enough HTML for test assertions (v-model, events)
// without requiring PrimeVue to be installed in the test environment.
config.global.stubs = {
  InputText: {
    template: '<input v-bind="$attrs" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  Password: {
    template: '<input type="password" v-bind="$attrs" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'feedback', 'toggleMask'],
    emits: ['update:modelValue'],
  },
  Button: {
    template: '<button :type="type || \'button\'" :disabled="disabled || loading" v-bind="$attrs">{{ label }}<slot /></button>',
    props: ['label', 'icon', 'loading', 'disabled', 'type'],
  },
  Message: {
    template: '<div role="alert" :data-severity="severity"><slot /></div>',
    props: ['severity', 'closable'],
  },
  Dialog: {
    template: '<div v-if="visible"><slot /><slot name="footer" /></div>',
    props: ['visible', 'modal', 'closable', 'header'],
  },
  RouterLink: {
    template: '<a :href="to"><slot /></a>',
    props: ['to'],
  },
  RouterView: { template: '<div><slot /></div>' },
}

// ─── Pinia — fresh store for every test ──────────────────────────────────────
beforeEach(() => {
  setActivePinia(createPinia())
})

// ─── Suppress expected console noise during tests ────────────────────────────
// Warnings from Vue / Pinia internals about missing router context etc.
const consoleWarn  = console.warn.bind(console)
const consoleError = console.error.bind(console)

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    const msg = String(args[0])
    if (
      msg.includes('[Vue Router]') ||
      msg.includes('[Vue warn]')   ||
      msg.includes('currentInstance')
    ) return
    consoleWarn(...args)
  })
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    const msg = String(args[0])
    if (msg.includes('[Vue warn]')) return
    consoleError(...args)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
