import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, nextTick, defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import App from '@/App.vue'

const route = reactive({
  path: '/',
  meta: { title: '儀表板' },
})

vi.mock('vue-router', () => ({
  useRoute: () => route,
  RouterView: defineComponent({
    name: 'RouterView',
    template: '<div class="router-view" />',
  }),
}))

vi.mock('@/layouts/AdminLayout.vue', () => ({
  default: defineComponent({
    name: 'AdminLayout',
    template: '<div class="admin-layout" />',
  }),
}))

describe('App', () => {
  beforeEach(() => {
    route.path = '/'
    route.meta = { title: '儀表板' }
    document.title = ''
    document.head.innerHTML = '<meta name="apple-mobile-web-app-title" content="常春藤管理系統">'
  })

  it('根據目前路由更新管理端頁面標題', async () => {
    mount(App, {
      global: {
        stubs: {
          RouterView: true,
        },
      },
    })

    await nextTick()

    expect(document.title).toBe('儀表板｜常春藤管理系統')
    expect(
      document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')
    ).toBe('常春藤管理系統')
  })

  it('切換到教師入口路由時更新對應標題', async () => {
    mount(App, {
      global: {
        stubs: {
          RouterView: true,
        },
      },
    })
    await nextTick()

    route.path = '/portal/attendance'
    route.meta = { portal: true }
    await nextTick()

    expect(document.title).toBe('常春藤教師入口')
    expect(
      document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')
    ).toBe('常春藤教師入口')
  })
})
