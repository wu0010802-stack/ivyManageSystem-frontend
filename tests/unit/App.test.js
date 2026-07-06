import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, nextTick, defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { ElConfigProvider } from 'element-plus'
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

/**
 * App 元件的 mount helper，標準化測試用的 mount 選項
 */
function mountApp() {
  return mount(App, {
    global: {
      components: {
        ElConfigProvider,
      },
      stubs: {
        RouterView: true,
      },
    },
  })
}

describe('App', () => {
  beforeEach(() => {
    route.path = '/'
    route.meta = { title: '儀表板' }
    document.title = ''
    document.head.innerHTML = '<meta name="apple-mobile-web-app-title" content="常春藤管理系統">'
  })

  it('根據目前路由更新管理端頁面標題', async () => {
    mountApp()

    await nextTick()

    expect(document.title).toBe('儀表板｜常春藤管理系統')
    expect(
      document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')
    ).toBe('常春藤管理系統')
  })

  it('切換到教師入口路由時更新對應標題', async () => {
    mountApp()
    await nextTick()

    route.path = '/portal/attendance'
    route.meta = { portal: true }
    await nextTick()

    expect(document.title).toBe('常春藤教師入口')
    expect(
      document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')
    ).toBe('常春藤教師入口')
  })

  it('以 ElConfigProvider 提供 zh-tw locale（空表格顯示「暫無資料」而非 No Data）', () => {
    const wrapper = mountApp()
    const provider = wrapper.findComponent(ElConfigProvider)
    expect(provider.exists()).toBe(true)
    expect(provider.props('locale').name).toBe('zh-tw')
  })
})
