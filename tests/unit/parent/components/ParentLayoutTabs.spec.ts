import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import ParentLayout from '@/parent/layouts/ParentLayout.vue'

vi.mock('@/parent/api/announcements', () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ data: { unread_count: 0 } }),
}))

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/home', name: 'h', meta: { tab: 'home', title: '首頁' }, component: { template: '<div/>' } },
    ],
  })
  router.push('/home')
  return router
}

async function mountLayout() {
  setActivePinia(createPinia())
  const router = makeRouter()
  await router.isReady()
  const pushSpy = vi.spyOn(router, 'push')
  const wrapper = mount(ParentLayout, {
    global: {
      plugins: [router],
      stubs: {
        M3TopAppBar: {
          template: '<header><slot name="actions" /></header>',
        },
        M3NavigationBar: {
          template: '<nav><button v-for="item in items" :key="item.key" class="tab" :data-key="item.key">{{ item.label }}</button></nav>',
          props: ['items', 'currentKey'],
          emits: ['select'],
        },
        ConnectionBanner: true,
        MeDrawer: true,
      },
    },
  })
  await flushPromises()
  return { wrapper, router, pushSpy }
}

describe('ParentLayout 5-tab 導航（P2 IA 重整）', () => {
  // 2026-08-28：訊息功能下架，第三個 tab 換成聯絡簿。
  it('TABS 依序為 home/child/contact-book/admin/me', async () => {
    const { wrapper } = await mountLayout()
    const keys = wrapper.findAll('.tab').map((el) => el.attributes('data-key'))
    expect(keys).toEqual(['home', 'child', 'contact-book', 'admin', 'me'])
  })

  it('第三個 tab 標籤為「聯絡簿」且指向 /contact-book', async () => {
    const { wrapper } = await mountLayout()
    const tab = wrapper.findAll('.tab')[2]
    expect(tab.text()).toBe('聯絡簿')
  })

  it('不再有訊息 tab', async () => {
    const { wrapper } = await mountLayout()
    const labels = wrapper.findAll('.tab').map((el) => el.text())
    expect(labels).not.toContain('訊息')
  })

  it('點頭像 icon 導向 /me，不再開啟 MeDrawer', async () => {
    const { wrapper, pushSpy } = await mountLayout()
    const avatarBtn = wrapper.find('[aria-label="我的"]')
    expect(avatarBtn.exists()).toBe(true)
    await avatarBtn.trigger('click')
    expect(pushSpy).toHaveBeenCalledWith('/me')
  })

  it('不再掛載 MeDrawer（drawerOpen 邏輯已退場）', async () => {
    const { wrapper } = await mountLayout()
    expect(wrapper.findComponent({ name: 'MeDrawer' }).exists()).toBe(false)
  })
})
