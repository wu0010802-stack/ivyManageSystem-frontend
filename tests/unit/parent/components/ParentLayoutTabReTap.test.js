import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import ParentLayout from '@/parent/layouts/ParentLayout.vue'

/**
 * 測試 tab re-tap 行為：
 *  - 在 /home，點 home tab → window.scrollTo({top:0,...}) 被呼叫
 *  - 在 /home，點 attendance tab → 不 scrollTo
 *  - 在 /messages/123（深層），點 messages tab → 不 scrollTo（讓 router-link 正常導回 /messages 列表）
 */

vi.mock('@/parent/api/announcements', () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ data: { unread_count: 0 } }),
}))
vi.mock('@/parent/api/messages', () => ({
  getMessageUnreadCount: vi.fn().mockResolvedValue({ data: { unread_count: 0 } }),
}))

function makeRouter(initialPath, meta = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/home', name: 'h', meta: { tab: 'home', ...(initialPath === '/home' ? meta : {}) }, component: { template: '<div>home</div>' } },
      { path: '/attendance', name: 'a', meta: { tab: 'attendance' }, component: { template: '<div>a</div>' } },
      { path: '/messages', name: 'm', meta: { tab: 'messages' }, component: { template: '<div>m</div>' } },
      { path: '/messages/:id', name: 'mt', meta: { tab: 'messages' }, component: { template: '<div>mt</div>' } },
      { path: '/announcements', name: 'an', meta: { tab: 'announcements' }, component: { template: '<div>an</div>' } },
      { path: '/more', name: 'mo', meta: { tab: 'more' }, component: { template: '<div>mo</div>' } },
    ],
  })
  router.push(initialPath)
  return router
}

async function mountLayout(initialPath) {
  setActivePinia(createPinia())
  const router = makeRouter(initialPath)
  await router.isReady()
  const wrapper = mount(ParentLayout, {
    global: {
      plugins: [router],
      stubs: {
        AppHeader: true,
        ConnectionBanner: true,
        ParentIcon: true,
      },
    },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

describe('ParentLayout tab re-tap', () => {
  let scrollToSpy
  beforeEach(() => {
    scrollToSpy = vi.fn()
    Object.defineProperty(window, 'scrollTo', { value: scrollToSpy, configurable: true, writable: true })
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
      configurable: true,
      writable: true,
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('在 /home，點 home tab → 觸發 scrollTo top', async () => {
    const { wrapper } = await mountLayout('/home')
    const tabs = wrapper.findAll('.tab-item')
    // home 是第一個 tab
    await tabs[0].trigger('click')
    expect(scrollToSpy).toHaveBeenCalledTimes(1)
    const arg = scrollToSpy.mock.calls[0][0]
    expect(arg.top).toBe(0)
    expect(arg.behavior).toBe('smooth')
    wrapper.unmount()
  })

  it('在 /home，點 attendance tab → 不觸發 scrollTo（讓 router-link 正常導航）', async () => {
    const { wrapper } = await mountLayout('/home')
    const tabs = wrapper.findAll('.tab-item')
    // attendance 是第二個 tab
    await tabs[1].trigger('click')
    expect(scrollToSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('在 /messages/123 深層，點 messages tab → 不觸發 scrollTo（仍應導航回 /messages）', async () => {
    const { wrapper } = await mountLayout('/messages/123')
    const tabs = wrapper.findAll('.tab-item')
    // messages 是第三個 tab
    await tabs[2].trigger('click')
    expect(scrollToSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('reduced-motion 下 → 用 behavior:auto（即時跳）', async () => {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
      configurable: true,
      writable: true,
    })
    const { wrapper } = await mountLayout('/home')
    const tabs = wrapper.findAll('.tab-item')
    await tabs[0].trigger('click')
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
    wrapper.unmount()
  })
})
