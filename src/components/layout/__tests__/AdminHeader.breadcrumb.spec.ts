/**
 * 頂列麵包屑父層測試（spec §3.4）。
 *
 * 本檔刻意「不」mock vue-router（既有 AdminHeader.spec.ts 有整包 mock），
 * 因為要驗證的正是 <router-link> 的真實渲染與 to 目標。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHashHistory } from 'vue-router'

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
  ElIcon: passthrough,
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

const Blank = { template: '<div />' }
const TEST_ROUTES = [
  { path: '/', component: Blank, meta: { title: '儀表板' } },
  { path: '/employees', component: Blank, meta: { title: '員工管理' } },
  { path: '/salary', component: Blank, meta: { title: '薪資管理' } },
  { path: '/salary/growth-contract', component: Blank, meta: { title: '自主成長獎勵金' } },
  { path: '/workbench', redirect: '/workbench/approvals' },
  { path: '/workbench/approvals', component: Blank, meta: { title: '待簽核' } },
  { path: '/activity/pos', component: Blank, meta: { title: 'POS 收銀' } },
  {
    path: '/activity/audit/pos-unlock',
    component: Blank,
    meta: { title: 'POS 異常稽核軌跡', parent: '/activity/pos' },
  },
]

async function mountAt(path: string) {
  const router = createRouter({ history: createWebHashHistory(), routes: TEST_ROUTES })
  router.push(path)
  await router.isReady()
  return mount(AdminHeader, {
    props: { isMobile: false, sidebarOpen: false },
    global: { plugins: [router], stubs },
  })
}

describe('AdminHeader 頂列麵包屑父層', () => {
  it('子頁渲染可點父層，連結指向父層路徑', async () => {
    const wrapper = await mountAt('/salary/growth-contract')
    const link = wrapper.find('a.page-title__parent')
    expect(link.exists(), '子頁應渲染父層連結').toBe(true)
    expect(link.attributes('href')).toContain('/salary')
    expect(link.text()).toContain('薪資管理')
  })

  it('父層帶返回箭頭圖示', async () => {
    const wrapper = await mountAt('/salary/growth-contract')
    expect(wrapper.find('.page-title__back').exists()).toBe(true)
  })

  it('父層有無障礙標籤', async () => {
    const wrapper = await mountAt('/salary/growth-contract')
    expect(wrapper.find('a.page-title__parent').attributes('aria-label')).toBe('返回薪資管理')
  })

  it('頁名照常渲染', async () => {
    const wrapper = await mountAt('/salary/growth-contract')
    expect(wrapper.find('.page-title__current').text()).toBe('自主成長獎勵金')
  })

  it('一級頁不渲染父層與分隔符', async () => {
    const wrapper = await mountAt('/employees')
    expect(wrapper.find('a.page-title__parent').exists()).toBe(false)
    expect(wrapper.find('.page-title__sep').exists()).toBe(false)
    expect(wrapper.find('.page-title__current').text()).toBe('員工管理')
  })

  it('父層是 redirect 容器時不渲染（點了會被轉回原頁）', async () => {
    const wrapper = await mountAt('/workbench/approvals')
    expect(wrapper.find('a.page-title__parent').exists()).toBe(false)
  })

  it('meta.parent 明示時以它為父層', async () => {
    const wrapper = await mountAt('/activity/audit/pos-unlock')
    const link = wrapper.find('a.page-title__parent')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('POS 收銀')
    expect(link.attributes('href')).toContain('/activity/pos')
  })
})
