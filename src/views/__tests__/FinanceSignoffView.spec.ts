import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { onBeforeRouteUpdate } from 'vue-router'
import { ElMessageBox } from 'element-plus'

const replaceMock = vi.fn()
const pushMock = vi.fn()
let mockQuery: Record<string, string> = {}

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  onBeforeRouteUpdate: vi.fn(),
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
  getUserInfo: vi.fn().mockReturnValue({ employee_id: 7 }),
}))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  const isMobile = ref(false)
  return {
    useIsMobile: () => ({ isMobile, cleanup: () => {} }),
    __setIsMobile: (v: boolean) => {
      isMobile.value = v
    },
  }
})

import { hasPermission } from '@/utils/auth'
import * as useIsMobileModule from '@/composables/useIsMobile'
import FinanceSignoffView from '../FinanceSignoffView.vue'

const setIsMobile = (
  useIsMobileModule as unknown as { __setIsMobile: (v: boolean) => void }
).__setIsMobile

const openCreateSpy = vi.fn()

const PanelStub = {
  props: ['config', 'highlightId', 'isMobile'],
  template:
    '<div class="panel-stub" :data-key="config.key" :data-highlight="highlightId ?? \'\'" />',
  methods: { openCreate: openCreateSpy },
}

const globalStubs = {
  SignoffPanel: PanelStub,
  MonthlyFixedCostPanel: { name: 'MonthlyFixedCostPanel', props: ['year', 'highlightMonth'], emits: ['update:dirty'], template: '<div data-test="fixed-cost-panel" :data-year="year" :data-month="highlightMonth" />' },
  'el-tabs': { template: '<div class="tabs-stub"><slot /></div>', props: ['modelValue'] },
  'el-tab-pane': { template: '<div class="tab-pane-stub" :data-label="label" />', props: ['label', 'name'] },
  'el-dropdown': {
    template: '<div class="dropdown-stub" @click="$emit(\'click\')"><slot /><slot name="dropdown" /></div>',
    props: ['splitButton', 'type', 'trigger'],
    emits: ['click', 'command'],
  },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div class="dropdown-item-stub"><slot /></div>', props: ['command'] },
  'el-button': { emits: ['click'], template: '<button data-test="el-button" @click="$emit(\'click\')"><slot /></button>' },
  'el-icon': { template: '<i><slot /></i>' },
}

const mountView = () =>
  mount(FinanceSignoffView, { global: { stubs: globalStubs } })

// 固定支出登錄表只給「沒有 REPORTS 權限」的角色（有 REPORTS 者改看導引，見下方 describe）
const withoutReports = () =>
  vi.mocked(hasPermission).mockImplementation((p: string) => p !== 'REPORTS')

describe('FinanceSignoffView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = {}
    setIsMobile(false)
    vi.mocked(hasPermission).mockReturnValue(true)
  })

  it('雙權限：顯示兩個 tab，預設第一個（vendor），頁名為收付款管理', () => {
    const wrapper = mountView()
    expect(wrapper.find('.tabs-stub').exists()).toBe(true)
    expect(wrapper.findAll('.tab-pane-stub')).toHaveLength(3)
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('vendor')
    expect(wrapper.text()).toContain('收付款管理')
    expect(wrapper.text()).not.toContain('收支簽收')
  })

  it('?tab=misc 時顯示 misc 面板', () => {
    mockQuery = { tab: 'misc' }
    const wrapper = mountView()
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('misc')
  })

  it('固定支出深連結帶入年度與月份，且不顯示廠商新增或簽收面板', () => {
    withoutReports()
    mockQuery = { tab: 'fixed-cost', year: '2025', month: '8' }
    const wrapper = mountView()
    expect(wrapper.find('[data-test="fixed-cost-panel"]').attributes('data-year')).toBe('2025')
    expect(wrapper.find('[data-test="fixed-cost-panel"]').attributes('data-month')).toBe('8')
    expect(wrapper.find('.panel-stub').exists()).toBe(false)
    expect(wrapper.find('[data-test="header-create"]').exists()).toBe(false)
  })

  it('只有雜項收款權限不能透過 query 開固定支出', () => {
    vi.mocked(hasPermission).mockImplementation(p => p === 'MISC_RECEIPT_READ')
    mockQuery = { tab: 'fixed-cost' }
    const wrapper = mountView()
    expect(wrapper.find('[data-test="fixed-cost-panel"]').exists()).toBe(false)
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('misc')
  })

  it('超出固定支出 API 年度範圍時退回今年，非法月份不標示', () => {
    withoutReports()
    mockQuery = { tab: 'fixed-cost', year: '2101', month: '13' }
    const wrapper = mountView()
    expect(wrapper.find('[data-test="fixed-cost-panel"]').attributes('data-year')).toBe(String(new Date().getFullYear()))
    expect(wrapper.find('[data-test="fixed-cost-panel"]').attributes('data-month')).toBeUndefined()
    wrapper.unmount()
  })

  it('同頁返回換年度時，未儲存且取消不得離開', async () => {
    withoutReports()
    mockQuery = { tab: 'fixed-cost', year: '2025' }
    const wrapper = mountView()
    wrapper.findComponent({ name: 'MonthlyFixedCostPanel' }).vm.$emit('update:dirty', true)
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel')
    const guard = vi.mocked(onBeforeRouteUpdate).mock.calls.at(-1)![0]
    const result = await guard(
      { query: { tab: 'fixed-cost', year: '2026' } } as never,
      { query: mockQuery } as never,
      vi.fn(),
    )
    expect(result).toBe(false)
    expect(confirm).toHaveBeenCalled()
    confirm.mockRestore()
    wrapper.unmount()
  })

  describe('固定支出登錄：依 REPORTS 權限分流', () => {
    it('有 REPORTS：不渲染登錄表，改顯示「已移到經營報表」說明與前往按鈕', () => {
      mockQuery = { tab: 'fixed-cost', year: '2025' }
      const wrapper = mountView() // 預設全權限，含 REPORTS
      expect(wrapper.find('[data-test="fixed-cost-panel"]').exists()).toBe(false)
      expect(wrapper.find('#fixed-cost-year').exists()).toBe(false)
      const moved = wrapper.find('[data-test="fixed-cost-moved"]')
      expect(moved.exists()).toBe(true)
      expect(moved.text()).toContain('固定支出登錄已移到「經營報表」，和每月結帳狀態放在一起。')
      expect(wrapper.find('[data-test="goto-reports-fixed-cost"]').text()).toBe('前往登錄')
    })

    it('「前往登錄」帶著目前年度跳到 /reports 的固定支出分頁', async () => {
      mockQuery = { tab: 'fixed-cost', year: '2025' }
      const wrapper = mountView()
      await wrapper.find('[data-test="goto-reports-fixed-cost"]').trigger('click')
      expect(pushMock).toHaveBeenCalledTimes(1)
      expect(pushMock).toHaveBeenCalledWith({
        path: '/reports',
        query: { tab: 'fixed-cost', year: '2025' },
      })
    })

    it('沒指定年度退回今年；深連結帶月份時一併帶過去', async () => {
      mockQuery = { tab: 'fixed-cost' }
      let wrapper = mountView()
      await wrapper.find('[data-test="goto-reports-fixed-cost"]').trigger('click')
      expect(pushMock).toHaveBeenLastCalledWith({
        path: '/reports',
        query: { tab: 'fixed-cost', year: String(new Date().getFullYear()) },
      })

      mockQuery = { tab: 'fixed-cost', year: '2025', month: '8' }
      wrapper = mountView()
      await wrapper.find('[data-test="goto-reports-fixed-cost"]').trigger('click')
      expect(pushMock).toHaveBeenLastCalledWith({
        path: '/reports',
        query: { tab: 'fixed-cost', year: '2025', month: '8' },
      })
    })

    it('沒有 REPORTS：照舊顯示登錄表，不顯示導引（避免失去入口）', () => {
      withoutReports()
      mockQuery = { tab: 'fixed-cost', year: '2025' }
      const wrapper = mountView()
      expect(wrapper.find('[data-test="fixed-cost-panel"]').exists()).toBe(true)
      expect(wrapper.find('#fixed-cost-year').exists()).toBe(true)
      expect(wrapper.find('[data-test="fixed-cost-moved"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="goto-reports-fixed-cost"]').exists()).toBe(false)
    })
  })

  it('?tab 無效值 fallback 到第一個可見模組', () => {
    mockQuery = { tab: 'nonsense' }
    const wrapper = mountView()
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('vendor')
  })

  it('只有 MISC_RECEIPT_READ：不顯示 tab bar、直接渲染 misc 面板', () => {
    vi.mocked(hasPermission).mockImplementation((p: string) => p === 'MISC_RECEIPT_READ')
    const wrapper = mountView()
    expect(wrapper.find('.tabs-stub').exists()).toBe(false)
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('misc')
  })

  it('?highlight=7 解析為 number 傳給面板；非數字忽略', () => {
    mockQuery = { tab: 'vendor', highlight: '7' }
    expect(mountView().find('.panel-stub').attributes('data-highlight')).toBe('7')
    mockQuery = { tab: 'vendor', highlight: 'abc' }
    expect(mountView().find('.panel-stub').attributes('data-highlight')).toBe('')
  })

  it('tab fallback 時不得把 highlight 帶進另一個模組', () => {
    // 只有 vendor 權限 + misc 深連結：落到 vendor 面板，highlight 必須清空
    vi.mocked(hasPermission).mockImplementation((p: string) => p === 'VENDOR_PAYMENT_READ')
    mockQuery = { tab: 'misc', highlight: '7' }
    let wrapper = mountView()
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('vendor')
    expect(wrapper.find('.panel-stub').attributes('data-highlight')).toBe('')

    // 無效 tab 值 fallback 同理
    vi.mocked(hasPermission).mockReturnValue(true)
    mockQuery = { tab: 'nonsense', highlight: '7' }
    wrapper = mountView()
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('vendor')
    expect(wrapper.find('.panel-stub').attributes('data-highlight')).toBe('')

    // query 無 tab 時 highlight 照常生效（直連預設模組）
    mockQuery = { highlight: '7' }
    expect(mountView().find('.panel-stub').attributes('data-highlight')).toBe('7')
  })

  describe('新增入口（桌面 header split action）', () => {
    it('桌面版：header 顯示 active tab 的主新增按鈕與跨方向 dropdown 項', () => {
      const wrapper = mountView()
      const header = wrapper.find('[data-test="header-create"]')
      expect(header.exists()).toBe(true)
      expect(header.text()).toContain('新增付款') // active=vendor
      const secondary = wrapper.find('[data-test="header-create-secondary"]')
      expect(secondary.exists()).toBe(true)
      expect(secondary.text()).toContain('新增收款')
      // 桌面版不得同時出現 mobile sticky CTA
      expect(wrapper.find('[data-test="mobile-sticky-cta"]').exists()).toBe(false)
    })

    it('active tab 為 misc 時主按鈕變為新增收款', () => {
      mockQuery = { tab: 'misc' }
      const wrapper = mountView()
      expect(wrapper.find('[data-test="header-create"]').text()).toContain('新增收款')
      expect(wrapper.find('[data-test="header-create-secondary"]').text()).toContain('新增付款')
    })

    it('header 主按鈕點擊呼叫 panel 的同一個 create handler', async () => {
      const wrapper = mountView()
      await wrapper.find('[data-test="header-create"]').trigger('click')
      await flushPromises()
      expect(openCreateSpy).toHaveBeenCalledTimes(1)
    })

    it('跨方向新增：createFor(另一方向) 會切 tab 後開新增表單', async () => {
      const wrapper = mountView()
      const vm = wrapper.vm as unknown as { createFor: (k: string) => Promise<void> }
      await vm.createFor('misc')
      await flushPromises()
      expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('misc')
      expect(openCreateSpy).toHaveBeenCalled()
    })

    it('無任何 WRITE 權限時不顯示新增入口', () => {
      vi.mocked(hasPermission).mockImplementation((p: string) => p.endsWith('_READ'))
      const wrapper = mountView()
      expect(wrapper.find('[data-test="header-create"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="mobile-sticky-cta"]').exists()).toBe(false)
    })
  })

  describe('新增入口（行動版 sticky CTA）', () => {
    beforeEach(() => {
      setIsMobile(true)
    })

    it('行動版：顯示 sticky 滿寬主按鈕與同列選單鈕，且 header CTA 不同時出現', () => {
      const wrapper = mountView()
      expect(wrapper.find('[data-test="mobile-sticky-cta"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="mobile-create-primary"]').text()).toContain('新增付款')
      expect(wrapper.find('[data-test="mobile-create-more"]').exists()).toBe(true)
      // 不得同時顯示桌面 header CTA
      expect(wrapper.find('[data-test="header-create"]').exists()).toBe(false)
    })

    it('sticky 主按鈕呼叫同一個 create handler', async () => {
      const wrapper = mountView()
      await wrapper.find('[data-test="mobile-create-primary"]').trigger('click')
      await flushPromises()
      expect(openCreateSpy).toHaveBeenCalled()
    })

    it('sticky 主按鈕與選單鈕套用 44px 觸控目標 class', () => {
      const wrapper = mountView()
      expect(
        wrapper.find('[data-test="mobile-create-primary"]').classes(),
      ).toContain('tap-target')
      expect(
        wrapper.find('[data-test="mobile-create-more"]').classes(),
      ).toContain('tap-target')
    })

    it('把 isMobile 傳給面板（卡片列表切換用）', () => {
      const wrapper = mountView()
      const panel = wrapper.findComponent(PanelStub)
      expect(panel.props('isMobile')).toBe(true)
    })
  })
})
