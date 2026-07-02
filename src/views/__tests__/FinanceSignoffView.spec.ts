import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const replaceMock = vi.fn()
let mockQuery: Record<string, string> = {}

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace: replaceMock }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn().mockReturnValue(true) }))

import { hasPermission } from '@/utils/auth'
import FinanceSignoffView from '../FinanceSignoffView.vue'

const PanelStub = {
  props: ['config', 'highlightId'],
  template: '<div class="panel-stub" :data-key="config.key" :data-highlight="highlightId ?? \'\'" />',
}

const globalStubs = {
  SignoffPanel: PanelStub,
  'el-tabs': { template: '<div class="tabs-stub"><slot /></div>', props: ['modelValue'] },
  'el-tab-pane': { template: '<div class="tab-pane-stub" :data-label="label" />', props: ['label', 'name'] },
}

const mountView = () =>
  mount(FinanceSignoffView, { global: { stubs: globalStubs } })

describe('FinanceSignoffView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = {}
    vi.mocked(hasPermission).mockReturnValue(true)
  })

  it('雙權限：顯示兩個 tab，預設第一個（vendor）', () => {
    const wrapper = mountView()
    expect(wrapper.find('.tabs-stub').exists()).toBe(true)
    expect(wrapper.findAll('.tab-pane-stub')).toHaveLength(2)
    expect(wrapper.find('.panel-stub').attributes('data-key')).toBe('vendor')
    expect(wrapper.text()).toContain('收支簽收')
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
})
