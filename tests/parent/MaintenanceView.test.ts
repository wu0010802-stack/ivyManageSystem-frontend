import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

const apiGetMock = vi.fn()
vi.mock('@/parent/api', () => ({
  default: { get: (...args: unknown[]) => apiGetMock(...args) },
}))
vi.mock('@/parent/api/index', () => ({
  default: { get: (...args: unknown[]) => apiGetMock(...args) },
}))

const toastWarnMock = vi.fn()
vi.mock('@/parent/utils/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warn: (...args: unknown[]) => toastWarnMock(...args),
    info: vi.fn(),
  },
}))

const reloadMock = vi.fn()
let originalReload: (() => void) | undefined

beforeEach(() => {
  apiGetMock.mockReset()
  toastWarnMock.mockReset()
  reloadMock.mockReset()
  originalReload = window.location.reload
  Object.defineProperty(window.location, 'reload', {
    configurable: true,
    writable: true,
    value: reloadMock,
  })
})

afterEach(() => {
  if (originalReload) {
    Object.defineProperty(window.location, 'reload', {
      configurable: true,
      writable: true,
      value: originalReload,
    })
  }
})

async function buildHarness(query: Record<string, string> = {}) {
  const MaintenanceView = (await import('@/parent/views/MaintenanceView.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/maintenance', component: MaintenanceView },
      { path: '/', component: { template: '<div />' } },
    ],
  })
  const qs = new URLSearchParams(query).toString()
  await router.push(`/maintenance${qs ? '?' + qs : ''}`)
  await router.isReady()
  const w = mount(MaintenanceView, { global: { plugins: [router] } })
  return { w, router }
}

describe('Parent MaintenanceView', () => {
  it('shows default message + Material Symbol icon', async () => {
    const { w } = await buildHarness()
    expect(w.text()).toContain('系統升級中')
    // 已改用 Material Symbols（engineering icon），不再使用 emoji
    expect(w.find('.material-symbols-rounded').exists()).toBe(true)
    expect(w.text()).toContain('系統維護中')
  })

  it('uses query.message when present', async () => {
    const { w } = await buildHarness({ message: '預計 02:00 完成升級' })
    expect(w.text()).toContain('預計 02:00 完成升級')
  })

  it('clicking refresh probes /health/ready and reloads on 200', async () => {
    apiGetMock.mockResolvedValueOnce({ status: 200 })
    const { w } = await buildHarness()
    await w.find('button').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(apiGetMock).toHaveBeenCalledWith('/health/ready')
    expect(reloadMock).toHaveBeenCalled()
  })

  it('still maintenance: no reload, toast.warn fired', async () => {
    apiGetMock.mockRejectedValueOnce({ response: { status: 503 } })
    const { w } = await buildHarness()
    await w.find('button').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(reloadMock).not.toHaveBeenCalled()
    expect(toastWarnMock).toHaveBeenCalled()
  })
})
