import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const replaceMock = vi.fn()
let mockQuery: Record<string, string> = {}

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace: replaceMock }),
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
  'el-tabs': { template: '<div class="tabs-stub"><slot /></div>', props: ['modelValue'] },
  'el-tab-pane': { template: '<div class="tab-pane-stub" :data-label="label" />', props: ['label', 'name'] },
  'el-dropdown': {
    template: '<div class="dropdown-stub" @click="$emit(\'click\')"><slot /><slot name="dropdown" /></div>',
    props: ['splitButton', 'type', 'trigger'],
    emits: ['click', 'command'],
  },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div class="dropdown-item-stub"><slot /></div>', props: ['command'] },
  'el-button': { template: '<button data-test="el-button" @click="$emit(\'click\')"><slot /></button>' },
  'el-icon': { template: '<i><slot /></i>' },
}

const mountView = () =>
  mount(FinanceSignoffView, { global: { stubs: globalStubs } })

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
    expect(wrapper.findAll('.tab-pane-stub')).toHaveLength(2)
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('vendor')
    expect(wrapper.text()).toContain('收付款管理')
    expect(wrapper.text()).not.toContain('收支簽收')
  })

  it('?tab=misc 時顯示 misc 面板', () => {
    mockQuery = { tab: 'misc' }
    const wrapper = mountView()
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('misc')
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
