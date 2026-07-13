import { describe, it, expect, beforeEach, vi } from 'vitest'
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

import SettingsView from '../SettingsView.vue'

// el-tab-pane stub：呈現 label 以便 wrapper.text() 可斷言
const tabPaneStub = {
  template: '<section :data-name="name" :data-label="label"><slot /></section>',
  props: ['label', 'name', 'lazy'],
}

const globalConfig = {
  stubs: {
    // el-tabs 只渲染 slot 內容
    'el-tabs': { template: '<div data-test="tabs"><slot /></div>', props: ['modelValue', 'type'] },
    'el-tab-pane': tabPaneStub,
    'el-tag': { template: '<span><slot /></span>', props: ['type', 'size'] },
    // 子 settings tab 元件全部 shallow stub 掉（shallowMount 已自動，但保留明確 key）
    SettingsShiftTab: { template: '<div data-test="shift-tab" />' },
    SettingsAccountsTab: { template: '<div data-test="accounts-tab" />' },
    SettingsApprovalTab: { template: '<div data-test="approval-tab" />' },
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
    expect(wrapper.html()).toContain('帳號與權限')
  })
})
