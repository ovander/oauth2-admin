/**
 * Unit tests for the tokenStore in src/services/api.ts
 *
 * Security relevance (F-01):
 *  The entire in-memory token storage strategy hinges on tokenStore working
 *  correctly. If set() accidentally persists to localStorage, or clear() fails
 *  to null the value, access tokens survive beyond the intended session scope.
 *
 *  We also verify that localStorage / sessionStorage are never touched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tokenStore } from '@/services/api'

describe('tokenStore — in-memory access token management (F-01)', () => {
  // Reset the in-memory token before each test
  beforeEach(() => {
    tokenStore.clear()
  })

  // ── get ─────────────────────────────────────────────────────────────────────

  it('get() returns null when no token has been set', () => {
    expect(tokenStore.get()).toBeNull()
  })

  // ── set ─────────────────────────────────────────────────────────────────────

  it('set() stores the token and get() retrieves it', () => {
    tokenStore.set('eyJhbGciOiJSUzI1NiJ9.test-token')
    expect(tokenStore.get()).toBe('eyJhbGciOiJSUzI1NiJ9.test-token')
  })

  it('set() overwrites a previously stored token', () => {
    tokenStore.set('first-token')
    tokenStore.set('second-token')
    expect(tokenStore.get()).toBe('second-token')
  })

  // ── clear ────────────────────────────────────────────────────────────────────

  it('clear() resets the token to null', () => {
    tokenStore.set('some-token')
    tokenStore.clear()
    expect(tokenStore.get()).toBeNull()
  })

  it('clear() is idempotent — calling it twice does not throw', () => {
    expect(() => {
      tokenStore.clear()
      tokenStore.clear()
    }).not.toThrow()
  })

  // ── Storage isolation (F-01 regression guard) ────────────────────────────────

  it('NEVER writes to localStorage', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    tokenStore.set('must-not-persist')
    tokenStore.get()
    tokenStore.clear()
    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('NEVER reads from localStorage', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
    tokenStore.set('some-value')
    tokenStore.get()
    expect(getItemSpy).not.toHaveBeenCalled()
  })

  it('NEVER writes to sessionStorage', () => {
    const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem')
    tokenStore.set('must-not-persist')
    expect(setItemSpy).not.toHaveBeenCalled()
  })
})

// ─── getErrorMessage ──────────────────────────────────────────────────────────

import { getErrorMessage } from '@/services/api'
import axios from 'axios'

describe('getErrorMessage()', () => {
  it('extracts message field from Axios error response data', () => {
    const err = new axios.AxiosError('Request failed', '500', undefined, undefined, {
      data: { message: 'Token has expired' },
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: {} as any,
    })
    expect(getErrorMessage(err)).toBe('Token has expired')
  })

  it('extracts error field when message is absent', () => {
    const err = new axios.AxiosError('Request failed', '500', undefined, undefined, {
      data: { error: 'invalid_client' },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as any,
    })
    expect(getErrorMessage(err)).toBe('invalid_client')
  })

  it('falls back to AxiosError.message when response data has no message/error', () => {
    const err = new axios.AxiosError('Network Error')
    expect(getErrorMessage(err)).toBe('Network Error')
  })

  it('returns generic string for non-Axios errors', () => {
    expect(getErrorMessage(new Error('unexpected'))).toBe('An unexpected error occurred')
    expect(getErrorMessage('string error')).toBe('An unexpected error occurred')
    expect(getErrorMessage(null)).toBe('An unexpected error occurred')
  })
})
