import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reactive } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

// --- Mock stores ---
vi.mock('@/stores/shift', () => ({
  useShiftStore: () => ({ fetchShiftTypes: vi.fn() }),
}))

// --- Mock auth（hasPermission 預設傳回 false；各 test 依需求覆寫）---
const mockHasPermission = vi.fn().mockReturnValue(false)

vi.mock('@/utils/auth', () => ({
  hasPermission: (...args: unknown[]) => mockHasPermission(...args),
  PERMISSION_NAMES: { DSR_MANAGE: 'DSR_MANAGE' },
}))

// --- Mock vue-router（提供 route.query / router.replace 供 URL 同步測試）---
// mockQuery 用 reactive 包，讓 watch(() => route.query.tab, ...) 能在測試中被實際觸發
// （模擬瀏覽器上一頁等非經 onTabChange 途徑造成的外部 query 變動）
const replace = vi.fn()
let mockQuery: Record<string, unknown> = reactive({})
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace }),
}))

import SettingsView from '../SettingsView.vue'

// el-tab-pane stub：呈現 label 以便 wrapper.text() 可斷言
const tabPaneStub = {
  template: '<section :data-name="name" :data-label="label"><slot /></section>',
  props: ['label', 'name', 'lazy'],
}

const globalConfig = {
  stubs: {
    // el-tabs 只渲染 slot 內容
    'el-tabs': {
      name: 'ElTabs',
      template: '<div data-test="tabs"><slot /></div>',
      props: ['modelValue', 'type'],
      emits: ['update:modelValue', 'tab-change'],
    },
    'el-tab-pane': tabPaneStub,
    'el-tag': { template: '<span><slot /></span>', props: ['type', 'size'] },
    // 子 settings tab 元件全部 shallow stub 掉（shallowMount 已自動，但保留明確 key）
    SettingsShiftTab: { template: '<div data-test="shift-tab" />' },
    SettingsLineTab: { template: '<div data-test="line-tab" />' },
    SettingsObservabilityTab: { template: '<div data-test="observability-tab" />' },
    DsrRequestsView: { template: '<div data-test="dsr-view" />' },
    PolicyVersionsView: { template: '<div data-test="policy-view" />' },
  },
}

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockReturnValue(false)
    mockQuery = reactive({})
    replace.mockClear()
  })

  it('無 DSR_MANAGE 權限時不顯示「個資權利請求」tab', async () => {
    mockHasPermission.mockReturnValue(false)
    const wrapper = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(wrapper.html()).not.toContain('個資權利請求')
    expect(wrapper.html()).not.toContain('隱私政策版本')
  })

  it('有 DSR_MANAGE 權限時顯示「個資權利請求」tab', async () => {
    mockHasPermission.mockImplementation((perm: string) => perm === 'DSR_MANAGE')
    const wrapper = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(wrapper.html()).toContain('個資權利請求')
  })

  it('有 DSR_MANAGE 權限時顯示「隱私政策版本」tab', async () => {
    mockHasPermission.mockImplementation((perm: string) => perm === 'DSR_MANAGE')
    const wrapper = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(wrapper.html()).toContain('隱私政策版本')
  })

  it('預設 activeTab 為 shifts，固定 tab 永遠顯示', async () => {
    const wrapper = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    // 確認固定存在的 tab（不受權限影響）
    expect(wrapper.html()).toContain('輪班別管理')
  })

  it('帳號分頁已自 /settings 移除', async () => {
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(w.find('[data-name="accounts"]').exists()).toBe(false)
  })

  it('審核流程分頁已移除（?tab=approval → fallback shifts）', async () => {
    mockQuery = reactive({ tab: 'approval' })
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('shifts')
    expect(w.find('[data-name="approval"]').exists()).toBe(false)
  })
})

describe('SettingsView tab ↔ URL 同步', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockReturnValue(false)
    mockQuery = reactive({})
    replace.mockClear()
  })

  it('無 tab query → 預設 shifts 並 normalize URL', async () => {
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('shifts')
    expect(replace).toHaveBeenCalledWith({ query: { tab: 'shifts' } })
  })

  it('舊深連結 ?tab=accounts&view=parent → redirect /settings/accounts 並保留 view', async () => {
    mockQuery = reactive({ tab: 'accounts', view: 'parent' })
    shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ path: '/settings/accounts', query: { view: 'parent' } })
  })

  it('舊深連結 ?tab=accounts（無 view）→ redirect /settings/accounts', async () => {
    mockQuery = reactive({ tab: 'accounts' })
    shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ path: '/settings/accounts', query: {} })
  })

  it('無權限者 deep link ?tab=dsr-requests → fallback shifts 並修正 URL', async () => {
    mockQuery = reactive({ tab: 'dsr-requests' })
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('shifts')
    expect(replace).toHaveBeenCalledWith({ query: { tab: 'shifts' } })
  })

  it('有 DSR_MANAGE 權限時 ?tab=dsr-requests 合法', async () => {
    mockHasPermission.mockImplementation((perm: string) => perm === 'DSR_MANAGE')
    mockQuery = reactive({ tab: 'dsr-requests' })
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('dsr-requests')
  })

  it('切換 tab → replace 更新 ?tab=', async () => {
    mockQuery = reactive({ tab: 'line' })
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    replace.mockClear()
    w.findComponent({ name: 'ElTabs' }).vm.$emit('tab-change', 'shifts')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ query: { tab: 'shifts' } })
  })
})
