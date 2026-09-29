/**
 * VersionBadge: the plain-text tooltip (title + aria-label) carries the full
 * build info of the console (version, build date, Node.js, Vite) and of the
 * Socrate server (version, commit, branch, build_time, go_version).
 * go_version is optional: servers up to v1.4.0 do not send it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { useVersionStore } from '@/stores/version'
import { useVersionInfo, withVPrefix } from '@/composables/useVersionInfo'
import VersionBadge from '@/components/VersionBadge.vue'

// A Socrate server after v1.4.0: GET /api/version also carries go_version
// (runtime.Version()).
const SERVER_BODY = {
  version:    'v1.4.2',
  commit:     'a1b2c3d',
  branch:     'main',
  build_time: '2026-09-28T14:03:11Z',
  go_version: 'go1.27.1',
}

// A server up to v1.4.0: no go_version.
const OLD_SERVER_BODY = {
  version:    'v1.4.0',
  commit:     '9f8e7d6',
  branch:     'main',
  build_time: '2026-08-01T09:00:00Z',
}

const CONSOLE_LINE =
  `Console ${withVPrefix(APP_VERSION)} — built ${APP_BUILD_DATE} ` +
  `with Node ${APP_BUILD_NODE}, Vite ${APP_BUILD_VITE}`

function stubVersionEndpoint(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ))
}

async function mountWith(body: unknown, status = 200) {
  stubVersionEndpoint(body, status)
  await useVersionStore().fetchBackend()
  return mount(VersionBadge, { global: { directives: { tooltip: {} } } })
}

function titleOf(wrapper: Awaited<ReturnType<typeof mountWith>>): string {
  return wrapper.find('div').attributes('title') ?? ''
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('VersionBadge build info', () => {
  it('build-time toolchain constants are injected', () => {
    expect(APP_BUILD_NODE).toMatch(/^v\d+\.\d+\.\d+/)
    expect(APP_BUILD_VITE).toMatch(/^\d+\.\d+\.\d+/)
    expect(useVersionInfo().clientToolchain)
      .toBe(`Node ${APP_BUILD_NODE} · Vite ${APP_BUILD_VITE}`)
  })

  it('tooltip shows the console toolchain and the server go_version', async () => {
    const wrapper = await mountWith(SERVER_BODY)
    const title = titleOf(wrapper)

    expect(title).toBe(
      `${CONSOLE_LINE}\n` +
      'Server v1.4.2 (a1b2c3d, main) — built 2026-09-28T14:03:11Z with go1.27.1',
    )
    expect(title).toContain(`Node ${APP_BUILD_NODE}`)
    expect(title).toContain(`Vite ${APP_BUILD_VITE}`)
    expect(title).toContain('go1.27.1')
    expect(wrapper.find('div').attributes('aria-label')).toBe(title)
    expect(useVersionInfo().backendGoVersion.value).toBe('go1.27.1')
    // The compact visible text is unchanged.
    expect(wrapper.text()).toContain(`FE ${APP_VERSION}`)
    expect(wrapper.text()).toContain('BE v1.4.2')
  })

  it('omits go_version for an older server without printing "undefined"', async () => {
    const wrapper = await mountWith(OLD_SERVER_BODY)
    const title = titleOf(wrapper)

    expect(title.split('\n')[1])
      .toBe('Server v1.4.0 (9f8e7d6, main) — built 2026-08-01T09:00:00Z')
    expect(title).not.toContain('undefined')
    expect(wrapper.html()).not.toContain('undefined')
    expect(useVersionInfo().backendGoVersion.value).toBe('')
  })

  it('says the server version is unavailable when the fetch fails', async () => {
    const wrapper = await mountWith({ error: 'unavailable' }, 503)
    const title = titleOf(wrapper)

    expect(title).toBe(`${CONSOLE_LINE}\nServer version unavailable`)
    expect(wrapper.text()).toContain('(offline)')
  })

  it('omits the parts a server did not send', async () => {
    const wrapper = await mountWith({ version: '1.4.2' })

    expect(titleOf(wrapper).split('\n')[1]).toBe('Server v1.4.2')
  })

  it('does not double the "v" prefix of a server version', async () => {
    const wrapper = await mountWith(SERVER_BODY)

    expect(titleOf(wrapper)).toContain('Server v1.4.2 ')
    expect(titleOf(wrapper)).not.toContain('vv')
    expect(wrapper.text()).not.toContain('vv')
  })

  it('withVPrefix adds "v" only when missing', () => {
    expect(withVPrefix('v1.4.0')).toBe('v1.4.0')
    expect(withVPrefix('1.4.0')).toBe('v1.4.0')
    expect(withVPrefix('1.0.0-rc.1')).toBe('v1.0.0-rc.1')
    expect(withVPrefix('…')).toBe('v…')
  })
})
