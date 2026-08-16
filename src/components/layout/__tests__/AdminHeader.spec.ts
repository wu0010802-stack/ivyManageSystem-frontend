import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// path 與 resolve 是 RouteLocationNormalized / Router 的必備成員，mock 必須提供：
// 缺 path 會讓消費端拿到 undefined，與生產行為不符（頂列麵包屑解析吃 route.path）。
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/', meta: { title: '儀表板' } }),
  useRouter: () => ({ push: vi.fn(), resolve: () => ({ matched: [], meta: {} }) }),
}))
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ fetchEmployees: vi.fn(), employees: [] }),
}))
vi.mock('@/api/auth', () => ({ impersonate: vi.fn() }))
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ role: 'admin', name: '管理員' }),
  clearAuth: vi.fn(),
  setUserInfo: vi.fn(),
  hasPermission: () => false,
}))

import AdminHeader from '../AdminHeader.vue'

const passthrough = { template: '<div><slot /><slot name="dropdown" /></div>' }
const stubs = {
  ElHeader: passthrough,
  ElIcon: true,
  ElButton: { template: '<button><slot /></button>' },
  ElAvatar: true,
  ElDropdown: passthrough,
  ElDropdownMenu: passthrough,
  ElDropdownItem: passthrough,
  ElDialog: passthrough,
  ElRadioGroup: passthrough,
  ElRadio: passthrough,
  ElInput: true,
  ElScrollbar: passthrough,
  GlobalSearch: true,
  AdminNotificationBell: true,
  A11yMenu: true,
}

describe('AdminHeader 行動版導覽開關', () => {
  it('提供名稱、控制目標與目前展開狀態', async () => {
    const wrapper = mount(AdminHeader, {
      props: { isMobile: true, sidebarOpen: false },
      global: { stubs },
    })
    const trigger = wrapper.get('button.hamburger-btn')

    expect(trigger.attributes('type')).toBe('button')
    expect(trigger.attributes('aria-label')).toBe('開啟導覽選單')
    expect(trigger.attributes('aria-controls')).toBe('admin-navigation')
    expect(trigger.attributes('aria-expanded')).toBe('false')

    await trigger.trigger('click')
    expect(wrapper.emitted('toggle-sidebar')).toHaveLength(1)
  })

  it('可將焦點還原至導覽開關', () => {
    const wrapper = mount(AdminHeader, {
      props: { isMobile: true, sidebarOpen: true },
      attachTo: document.body,
      global: { stubs },
    })
    const trigger = wrapper.get('button.hamburger-btn')

    ;(wrapper.vm as unknown as { focusSidebarToggle: () => void }).focusSidebarToggle()
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })
})
