/**
 * tests/unit/layouts/PortalLayout.bottomNav.test.ts
 *
 * Phase 1 殼層改版：底部導覽重排 + 申請 FAB + ivy-portal 品牌 class。
 *
 * (a) 手機模式 4 格：今日／＋申請（FAB）／出勤／我的；排班、學生、班級退出 tab
 *     （班級 2026-09-14 併進首頁，留著會與「今日」指向同一頁）
 * (b) 今日 tab 導向 /portal/home
 * (c) FAB 點擊開啟 ApplySheet（modelValue true）
 * (d) 出勤 tab 承接 swapPendingCount badge（排班 tab 退場後的可見性補償）
 * (e) mount 時 html 掛 ivy-portal class、unmount 移除（EP primary 收斂 indigo 的 scope）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import ElementPlus from 'element-plus'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))

const routerPush = vi.fn()

vi.mock('vue-router', () => ({
  RouterView: { template: '<div />' },
  useRoute: () => ({ path: '/portal/home' }),
  useRouter: () => ({ push: routerPush }),
}))

let userInfoData: Record<string, unknown> = {}

vi.mock('@/utils/auth', () => ({
  getUserInfo: () => userInfoData,
  setUserInfo: vi.fn(),
  clearAuth: vi.fn(),
  hasPortalPermission: vi.fn(() => false),
}))

vi.mock('@/api/portal', () => ({
  getSubstitutePendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 0 } })),
  getUnreadCount: vi.fn(() => Promise.resolve({ data: { unread_count: 0 } })),
  getSwapPendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 2 } })),
}))

vi.mock('@/api/dismissalCalls', () => ({
  getPortalPendingCount: vi.fn(() => Promise.resolve({ data: { count: 0 } })),
}))


vi.mock('@/api/portalClassHub', () => ({
  getTodayHub: vi.fn(() => Promise.resolve({ counts: {} })),
}))

vi.mock('@/api/auth', () => ({
  changePassword: vi.fn(() => Promise.resolve()),
  endImpersonate: vi.fn(() => Promise.resolve({ data: { user: {} } })),
  impersonate: vi.fn(() => Promise.resolve({ data: { user: {} } })),
}))

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(() => Promise.resolve({ data: [] })),
}))

vi.mock('@/composables/usePortalSearch', () => ({
  usePortalSearch: () => ({ openPalette: vi.fn() }),
  installPortalSearchKeyboard: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    ElMessageBox: Object.assign(vi.fn(() => Promise.resolve()), {
      alert: vi.fn(() => Promise.resolve()),
      confirm: vi.fn(() => Promise.resolve()),
    }),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

const stubs = {
  PortalSearchPalette: true,
  OfflineIndicator: true,
  A11yMenu: true,
  // ApplySheet 內部行為由自己的測試檔覆蓋；這裡只驗開關接線
  ApplySheet: {
    props: ['modelValue', 'substitutePendingCount'],
    template: '<div class="apply-sheet-stub" :data-open="String(modelValue)"></div>',
  },
}

import PortalLayout from '@/layouts/PortalLayout.vue'

const mountMobile = async () => {
  userInfoData = { name: '陳老師', role: 'teacher', impersonation_mode: null }
  mockIsMobile.value = true
  const wrapper = mount(PortalLayout, {
    global: { plugins: [ElementPlus], stubs },
  })
  await flushPromises()
  return wrapper
}

describe('PortalLayout — 底部導覽 Phase 1 殼層', () => {
  beforeEach(() => {
    routerPush.mockClear()
    mockIsMobile.value = false
    localStorage.setItem('portal_layout_v', '4')
  })

  it('(a) 手機模式 tab 為 今日/出勤/我的 + 申請 FAB；工作台/班級/排班/學生退場', async () => {
    const wrapper = await mountMobile()
    const nav = wrapper.find('.bottom-nav')
    expect(nav.exists()).toBe(true)

    const navText = nav.text()
    expect(navText).toContain('今日')
    expect(navText).toContain('出勤')
    expect(navText).toContain('我的')
    expect(navText).toContain('申請')
    expect(navText).not.toContain('工作台')
    expect(navText).not.toContain('排班')
    expect(navText).not.toContain('學生')
    // 班級功能 2026-09-14 併進首頁後，這個 tab 會與「今日」指向同一頁。
    expect(navText).not.toContain('班級')

    expect(nav.find('.bottom-fab').exists()).toBe(true)
    wrapper.unmount()
  })

  it('(b) 今日 tab push /portal/home；已無班級 tab', async () => {
    const wrapper = await mountMobile()
    const tabs = wrapper.findAll('.bottom-tab')
    const byLabel = (label: string) => tabs.find((t) => t.text().includes(label))

    expect(byLabel('班級')).toBeUndefined()

    await byLabel('今日')!.trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/portal/home')
    wrapper.unmount()
  })

  it('(c) 點 FAB 開啟 ApplySheet', async () => {
    const wrapper = await mountMobile()
    expect(wrapper.find('.apply-sheet-stub').attributes('data-open')).toBe('false')
    await wrapper.find('.bottom-fab').trigger('click')
    expect(wrapper.find('.apply-sheet-stub').attributes('data-open')).toBe('true')
    wrapper.unmount()
  })

  it('(d) 出勤 tab 顯示 swapPendingCount badge', async () => {
    const wrapper = await mountMobile()
    const tabs = wrapper.findAll('.bottom-tab')
    const attendTab = tabs.find((t) => t.text().includes('出勤'))!
    expect(attendTab.text()).toContain('2')
    wrapper.unmount()
  })

  it('(e) mount 掛 html.ivy-portal、unmount 移除', async () => {
    const wrapper = await mountMobile()
    expect(document.documentElement.classList.contains('ivy-portal')).toBe(true)
    wrapper.unmount()
    expect(document.documentElement.classList.contains('ivy-portal')).toBe(false)
  })
})

// 2026-10-12 業主裁定：帶班老師的底部導覽改「今日／點名／申請／聯絡簿／我的」——
// 原本最大的拇指位置給了一個月用幾次的「申請」，每天要做的點名、聯絡簿反而不在導覽列。
// 司機、行政等沒有班級的同仁維持「今日／申請／出勤／我的」。
describe('PortalLayout — 帶班老師的底部導覽', () => {
  const authMod = () => import('@/utils/auth')
  const hubMod = () => import('@/api/portalClassHub')

  beforeEach(async () => {
    routerPush.mockClear()
    localStorage.setItem('portal_layout_v', '4')
    vi.mocked((await authMod()).hasPortalPermission).mockImplementation(() => true)
    vi.mocked((await hubMod()).getTodayHub).mockResolvedValue({
      classroom_id: 7,
      counts: { attendance_pending: 3, contact_books_pending: 0 },
    } as never)
  })

  afterEach(async () => {
    vi.mocked((await authMod()).hasPortalPermission).mockImplementation(() => false)
    vi.mocked((await hubMod()).getTodayHub).mockResolvedValue({ counts: {} } as never)
  })

  it('有班級且有點名、聯絡簿權限：今日／點名／申請／聯絡簿／我的，申請在正中間', async () => {
    const wrapper = await mountMobile()
    const items = wrapper.find('.bottom-nav').element.children
    const labels = [...items].map((el) => el.textContent?.replace(/\s+/g, '').replace(/\d+/g, ''))
    expect(labels).toEqual(['今日', '點名', '申請', '聯絡簿', '我的'])
    expect(wrapper.find('.bottom-nav').text()).not.toContain('出勤')
    wrapper.unmount()
  })

  it('點名、聯絡簿 tab 直接進頁；有未點名時點名 tab 掛提示點', async () => {
    const wrapper = await mountMobile()
    const tab = (label: string) => wrapper.findAll('.bottom-tab').find((t) => t.text().includes(label))!
    expect(tab('點名').find('.el-badge__content.is-dot').exists()).toBe(true)
    expect(tab('聯絡簿').find('.el-badge__content.is-dot').exists()).toBe(false)
    await tab('點名').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/portal/student-attendance')
    await tab('聯絡簿').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/portal/contact-book')
    wrapper.unmount()
  })

  it('沒有班級（hub classroom_id=0）維持原本的四格', async () => {
    vi.mocked((await hubMod()).getTodayHub).mockResolvedValue({ classroom_id: 0, counts: {} } as never)
    const wrapper = await mountMobile()
    const text = wrapper.find('.bottom-nav').text()
    expect(text).toContain('出勤')
    expect(text).not.toContain('點名')
    wrapper.unmount()
  })

  it('有班級但沒有聯絡簿權限，也維持原本的四格（不放點不進去的 tab）', async () => {
    vi.mocked((await authMod()).hasPortalPermission).mockImplementation((p: string) => p !== 'PORTFOLIO_READ')
    const wrapper = await mountMobile()
    const text = wrapper.find('.bottom-nav').text()
    expect(text).toContain('出勤')
    expect(text).not.toContain('聯絡簿')
    wrapper.unmount()
  })
})
