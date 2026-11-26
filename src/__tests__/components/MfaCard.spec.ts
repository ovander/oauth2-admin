/**
 * Component test for the MFA self-service card: setting up two-factor
 * authentication, the recovery codes shown once, and turning it off.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { http, HttpResponse } from 'msw'
import { server } from '../msw/server'
import { BASE } from '../msw/handlers'
import MfaCard from '@/components/security/MfaCard.vue'

vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const CODES = ['aaaa-1111', 'bbbb-2222', 'cccc-3333']

// codesOnConfirm: Socrate v1.16.1+ sends the first recovery codes with the
// confirmation; an older one answers 204 and gives them on request.
function routes(enabled: boolean, codesOnConfirm = true) {
  const state = {
    enabled,
    confirmedWith: '',
    disabledWith: null as null | Record<string, string>,
    codesRequests: [] as Array<Record<string, string> | null>,
  }
  server.use(
    http.get(`${BASE}/api/profile/mfa`, () =>
      HttpResponse.json({ enabled: state.enabled, recovery_codes_remaining: state.enabled ? 3 : 0 })),
    http.post(`${BASE}/api/profile/mfa/enroll`, () =>
      HttpResponse.json({ secret: SECRET, provisioning_uri: `otpauth://totp/Socrate:op?secret=${SECRET}` })),
    http.post(`${BASE}/api/profile/mfa/confirm`, async ({ request }) => {
      const body = await request.json() as { code: string }
      if (body.code !== '123456') return HttpResponse.json({ error: 'invalid code' }, { status: 400 })
      state.confirmedWith = body.code
      state.enabled = true
      return codesOnConfirm ? HttpResponse.json({ recovery_codes: CODES }) : new HttpResponse(null, { status: 204 })
    }),
    http.post(`${BASE}/api/profile/mfa/recovery-codes`, async ({ request }) => {
      const text = await request.text()
      state.codesRequests.push(text ? JSON.parse(text) as Record<string, string> : null)
      return HttpResponse.json({ recovery_codes: CODES })
    }),
    http.post(`${BASE}/api/profile/mfa/disable`, async ({ request }) => {
      state.disabledWith = await request.json() as Record<string, string>
      state.enabled = false
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return state
}

describe('MfaCard', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn() }, configurable: true })
  })

  it('sets up two-factor authentication and shows the recovery codes once', async () => {
    const state = routes(false)
    const w = mount(MfaCard)
    await flushPromises()

    await w.get('[data-testid="mfa-start"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="mfa-secret"]').text()).toBe('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')
    expect(w.find('a[href^="otpauth://"]').exists()).toBe(true)

    await w.get('[data-testid="mfa-code"]').setValue('123456')
    await w.get('[data-testid="mfa-enroll"]').trigger('submit')
    await flushPromises()

    expect(state.confirmedWith).toBe('123456')
    const shown = w.get('[data-testid="mfa-recovery-codes"]').text()
    for (const c of CODES) expect(shown).toContain(c)
    // The codes came with the confirmation: no second request, which the
    // issuer could refuse without a fresh code.
    expect(state.codesRequests).toEqual([])

    await w.get('[data-testid="mfa-codes-done"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="mfa-recovery-codes"]').exists()).toBe(false)
    expect(w.text()).toContain('3 recovery code(s) left')
    // Nothing of the enrolment is kept in browser storage.
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(SECRET)
  })

  it('asks for the first codes when an older issuer does not send them with the confirmation', async () => {
    const state = routes(false, false)
    const w = mount(MfaCard)
    await flushPromises()
    await w.get('[data-testid="mfa-start"]').trigger('click')
    await flushPromises()
    await w.get('[data-testid="mfa-code"]').setValue('123456')
    await w.get('[data-testid="mfa-enroll"]').trigger('submit')
    await flushPromises()

    expect(state.codesRequests).toEqual([null])
    const shown = w.get('[data-testid="mfa-recovery-codes"]').text()
    for (const c of CODES) expect(shown).toContain(c)
  })

  it('replaces the recovery codes with the password and a code', async () => {
    const state = routes(true)
    const w = mount(MfaCard)
    await flushPromises()

    await w.get('[data-testid="mfa-new-codes"]').trigger('click')
    await flushPromises()
    // Nothing is replaced before the account is re-proved.
    expect(state.codesRequests).toEqual([])
    await w.get('#mfa-codes-password').setValue('S3cret!pass')
    await w.get('#mfa-codes-code').setValue(' 654321 ')
    await w.get('[data-testid="mfa-new-codes-form"]').trigger('submit')
    await flushPromises()

    expect(state.codesRequests).toEqual([{ password: 'S3cret!pass', code: '654321' }])
    const shown = w.get('[data-testid="mfa-recovery-codes"]').text()
    for (const c of CODES) expect(shown).toContain(c)
    // The password and code are not kept once used.
    await w.get('[data-testid="mfa-codes-done"]').trigger('click')
    await flushPromises()
    await w.get('[data-testid="mfa-new-codes"]').trigger('click')
    await flushPromises()
    expect((w.get('#mfa-codes-password').element as HTMLInputElement).value).toBe('')
    expect((w.get('#mfa-codes-code').element as HTMLInputElement).value).toBe('')
  })

  it('keeps the enrolment open when the code is refused', async () => {
    const state = routes(false)
    const w = mount(MfaCard)
    await flushPromises()
    await w.get('[data-testid="mfa-start"]').trigger('click')
    await flushPromises()
    await w.get('[data-testid="mfa-code"]').setValue('000000')
    await w.get('[data-testid="mfa-enroll"]').trigger('submit')
    await flushPromises()
    expect(state.enabled).toBe(false)
    expect(w.find('[data-testid="mfa-enroll"]').exists()).toBe(true)
  })

  it('turns two-factor authentication off with the password and a code', async () => {
    const state = routes(true)
    const w = mount(MfaCard)
    await flushPromises()
    expect(w.text()).toContain('3 recovery code(s) left')

    const off = w.findAll('button').find(b => b.text() === 'Turn off')
    await off!.trigger('click')
    await flushPromises()
    await w.get('#mfa-disable-password').setValue('S3cret!pass')
    await w.get('#mfa-disable-code').setValue('654321')
    await w.get('[data-testid="mfa-disable"]').trigger('submit')
    await flushPromises()

    expect(state.disabledWith).toEqual({ password: 'S3cret!pass', code: '654321' })
    expect(w.find('[data-testid="mfa-start"]').exists()).toBe(true)
  })
})
