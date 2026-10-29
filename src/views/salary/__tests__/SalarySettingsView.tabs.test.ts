import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'

// 薪資設定頁籤收斂（2026-10-29 S2）：節慶發放與未扣餘額、節慶停課登記、下學期超額獎金、
// 下學期才藝獎勵金四個批次作業頁籤已移到 /salary/batches，設定頁只剩 4 個頁籤；
// 同日 S5 再加「計算規則開關」（自系統設定 › 分校設定移入，需 SETTINGS_READ）＝5 個。
const { permState } = vi.hoisted(() => ({
  permState: { perms: new Set<string>(), fullView: true },
}))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => permState.perms.has(name),
  hasFullSalaryView: () => permState.fullView,
}))
vi.mock('@/composables/useUnsavedChangesGuard', () => ({
  confirmDiscardChanges: vi.fn(),
  useUnsavedChangesGuard: vi.fn(),
}))
const { routeState, replaceMock } = vi.hoisted(() => ({
  routeState: { query: {} as Record<string, string> },
  replaceMock: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: replaceMock }),
}))

import SalarySettingsView from '../SalarySettingsView.vue'
import { BATCH_TABS } from '../batchTabs'

function mountView() {
  return shallowMount(SalarySettingsView, {
    global: {
      stubs: {
        'el-tabs': { template: '<div><slot /></div>' },
        'el-tab-pane': {
          props: ['label', 'name'],
          template: '<section class="pane" :data-name="name" :data-label="label"><slot /></section>',
        },
      },
    },
  })
}
const paneNames = (w: ReturnType<typeof mountView>) => w.findAll('.pane').map((p) => p.attributes('data-name'))

describe('SalarySettingsView — 批次作業頁籤已移出、計算規則開關移入', () => {
  beforeEach(() => {
    permState.perms = new Set(['SALARY_READ', 'SALARY_WRITE', 'SETTINGS_READ'])
    permState.fullView = true
    routeState.query = {}
    replaceMock.mockReset()
  })

  it('5 個頁籤：獎金設定、才藝老師薪資、銀行轉帳、計算規則開關、計算規則說明', () => {
    const wrapper = mountView()
    expect(paneNames(wrapper)).toEqual(['bonus', 'art_teacher', 'system_settings', 'rule_switches', 'logic'])
    expect(wrapper.findAll('.pane').map((p) => p.attributes('data-label'))).toEqual([
      '獎金設定', '才藝老師薪資', '銀行轉帳', '計算規則開關', '計算規則說明',
    ])
  })

  it('計算規則開關需 SETTINGS_READ（元件的 GET 就是這個碼）：沒有就沒有該頁籤，?tab=rule_switches 退回第一個', () => {
    permState.perms = new Set(['SALARY_READ', 'SALARY_WRITE'])
    routeState.query = { tab: 'rule_switches' }
    const wrapper = mountView()
    expect(paneNames(wrapper)).toEqual(['art_teacher', 'system_settings', 'logic'])
    expect((wrapper.vm as unknown as { tab: string }).tab).toBe('art_teacher')
  })

  it('?tab=rule_switches：有 SETTINGS_READ 時直接開該頁籤，嵌入的設定區塊是 placement=salary', () => {
    routeState.query = { tab: 'rule_switches' }
    const wrapper = mountView()
    expect((wrapper.vm as unknown as { tab: string }).tab).toBe('rule_switches')
    const block = wrapper.findComponent({ name: 'SettingsTenantConfigTab' })
    expect(block.exists()).toBe(true)
    expect(block.props('placement')).toBe('salary')
  })

  it.each(BATCH_TABS)('即使元件被直接帶 ?tab=%s 也不認得，退回第一個頁籤（導向由 router 負責）', (key) => {
    routeState.query = { tab: key }
    const wrapper = mountView()
    expect(paneNames(wrapper)).not.toContain(key)
    expect((wrapper.vm as unknown as { tab: string }).tab).toBe('bonus')
  })
})
