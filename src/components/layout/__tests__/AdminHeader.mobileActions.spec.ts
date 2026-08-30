import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const push = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/', meta: { title: '儀表板' } }),
  useRouter: () => ({ push, resolve: () => ({ matched: [], meta: {} }) }),
}))
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ fetchEmployees: vi.fn(), employees: [] }),
}))
vi.mock('@/api/auth', () => ({ impersonate: vi.fn() }))

// role / permission 由各 case 覆寫；預設為「園長」：有 PORTAL_PREVIEW、role 在進前台名單內
const authState = {
  user: { role: 'supervisor', name: '園長', employee_id: 7 } as Record<string, unknown>,
  permissions: new Set<string>(['PORTAL_PREVIEW']),
}
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => authState.user,
  clearAuth: vi.fn(),
  setUserInfo: vi.fn(),
  hasPermission: (name: string) => authState.permissions.has(name),
}))

import AdminHeader from '../AdminHeader.vue'

const passthrough = { template: '<div><slot /><slot name="dropdown" /></div>' }
const stubs = {
  ElHeader: passthrough,
  ElIcon: true,
  ElButton: { template: '<button><slot /></button>' },
  ElAvatar: true,
  ElDropdown: { name: 'ElDropdown', template: '<div><slot /><slot name="dropdown" /></div>' },
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

const mountHeader = (isMobile: boolean) =>
  mount(AdminHeader, { props: { isMobile, sidebarOpen: false }, global: { stubs } })

beforeEach(() => {
  push.mockClear()
  authState.user = { role: 'supervisor', name: '園長', employee_id: 7 }
  authState.permissions = new Set(['PORTAL_PREVIEW'])
})

describe('AdminHeader 手機動作優先級', () => {
  it('手機：教師端／前台入口移出常駐列，收進帳號選單', () => {
    const wrapper = mountHeader(true)

    // 常駐列只留「搜尋 / 通知 / 無障礙 / 帳號」，兩個前台入口不再直接佔位
    expect(wrapper.find('[data-test="header-preview-portal"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="header-enter-portal"]').exists()).toBe(false)

    expect(wrapper.find('[data-test="menu-preview-portal"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="menu-enter-portal"]').exists()).toBe(true)
  })

  it('桌機：維持常駐按鈕，帳號選單不重複出現同一動作', () => {
    const wrapper = mountHeader(false)

    expect(wrapper.find('[data-test="header-preview-portal"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="header-enter-portal"]').exists()).toBe(true)

    expect(wrapper.find('[data-test="menu-preview-portal"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="menu-enter-portal"]').exists()).toBe(false)
  })

  it('手機選單沿用既有權限條件：無 PORTAL_PREVIEW 就不出現教師端入口', () => {
    authState.permissions = new Set()
    const wrapper = mountHeader(true)

    expect(wrapper.find('[data-test="menu-preview-portal"]').exists()).toBe(false)
    // role 仍在 admin/hr/supervisor 名單內 → 進入前台仍可見（與桌機條件逐字相同）
    expect(wrapper.find('[data-test="menu-enter-portal"]').exists()).toBe(true)
  })

  it('手機選單沿用既有角色條件：非 admin/hr/supervisor 不出現進入前台', () => {
    authState.user = { role: 'accountant', name: '會計', employee_id: 9 }
    authState.permissions = new Set()
    const wrapper = mountHeader(true)

    expect(wrapper.find('[data-test="menu-enter-portal"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="menu-preview-portal"]').exists()).toBe(false)
  })

  it('手機選單的「進入前台」走與桌機同一支 handler', async () => {
    const wrapper = mountHeader(true)
    // 選單項掛在 el-dropdown 的 command 通道上（非 @click），
    // 這裡從 dropdown stub 送出 command 以驗證真實接線。
    expect(wrapper.get('[data-test="menu-enter-portal"]').attributes('command')).toBe(
      'enter-portal',
    )
    await wrapper.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'enter-portal')

    expect(push).toHaveBeenCalledWith('/portal/attendance')
  })
})
