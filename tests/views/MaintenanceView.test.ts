import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'

// hoisted mocks for api.get + window.location.reload
const apiGetMock = vi.fn()
vi.mock('@/api', () => ({
  default: { get: (...args: unknown[]) => apiGetMock(...args) },
}))

async function buildHarness(query: Record<string, string> = {}) {
  const MaintenanceView = (await import('@/views/MaintenanceView.vue')).default
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
  const w = mount(MaintenanceView, {
    global: { plugins: [router, ElementPlus] },
  })
  return { w, router }
}

const reloadMock = vi.fn()
// happy-dom 預設 window.location.reload 不可重派；先 stash 再 restore
let originalReload: (() => void) | undefined

beforeEach(() => {
  apiGetMock.mockReset()
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

describe('MaintenanceView (admin)', () => {
  it('shows default message when no query given', async () => {
    const { w } = await buildHarness()
    expect(w.text()).toContain('系統維護中，請稍後再試')
  })

  it('uses query.message when present', async () => {
    const { w } = await buildHarness({ message: '升級中，預計 23:00 完成' })
    expect(w.text()).toContain('升級中，預計 23:00 完成')
  })

  it('clicking refresh probes /health/ready and reloads on 200', async () => {
    apiGetMock.mockResolvedValueOnce({ status: 200 })
    const { w } = await buildHarness()
    await w.find('button').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(apiGetMock).toHaveBeenCalledWith('/health/ready')
    expect(reloadMock).toHaveBeenCalled()
  })

  it('still maintenance: shows warning, no reload', async () => {
    apiGetMock.mockRejectedValueOnce({ response: { status: 503 } })
    const { w } = await buildHarness()
    await w.find('button').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(reloadMock).not.toHaveBeenCalled()
  })
})
