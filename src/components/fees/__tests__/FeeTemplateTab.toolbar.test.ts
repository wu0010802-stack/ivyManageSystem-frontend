/**
 * FeeTemplateTab toolbar（2026-08-25 IA 改版後）：
 * 「產生費用單」為每日排程＋手動補產並行（手動入口在帳單工作區 header，
 * 見 FeeWorkspaces.test.ts；本頁範本工具列仍無），本頁頂層剩兩個 action——
 * 管理範本（primary）＋
 * 檢視選單（展開/收合/重新載入收進 dropdown，沿用 2026-08-17 toolbar 收斂）。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import FeeTemplateTab from '@/components/fees/FeeTemplateTab.vue'

const getFeeTemplates = vi.fn(() => Promise.resolve([]))
vi.mock('@/api/fees', () => ({
  getFeeTemplates: (...args: unknown[]) => getFeeTemplates(...args),
}))
const getGrades = vi.fn(() => Promise.resolve({ data: [] }))
const getClassrooms = vi.fn(() => Promise.resolve({ data: [] }))
vi.mock('@/api/classrooms', () => ({
  getGrades: (...args: unknown[]) => getGrades(...args),
  getClassrooms: (...args: unknown[]) => getClassrooms(...args),
}))
const getStudents = vi.fn(() => Promise.resolve({ data: { items: [] } }))
vi.mock('@/api/students', () => ({
  getStudents: (...args: unknown[]) => getStudents(...args),
}))

const flushPromises = async () => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve()
}

const mountTab = () =>
  mount(FeeTemplateTab, {
    global: {
      stubs: {
        FeeTemplateManageDrawer: true,
        'el-collapse': true,
        'el-collapse-item': true,
        'el-table': true,
        'el-table-column': true,
      },
    },
  })

interface TabVm {
  filterYear: number
  filterSemester: number
  onViewCommand: (cmd: string) => void
  expandedClassrooms: Record<string | number, (string | number)[]>
}

beforeEach(() => vi.clearAllMocks())

describe('FeeTemplateTab toolbar（IA 改版後）', () => {
  it('本頁不再有「產生費用單」（產單已自動化）；管理範本升為 primary', async () => {
    const w = mountTab()
    await flushPromises()

    const buttons = w.findAll('el-button')
    expect(buttons.find((b) => b.text().includes('產生費用單'))).toBeUndefined()

    const manageBtn = buttons.find((b) => b.text().includes('管理範本'))
    expect(manageBtn).toBeTruthy()
    expect(manageBtn!.attributes('type')).toBe('primary')

    // 檢視動作維持收斂在 dropdown（不再是頂層 el-button）
    expect(buttons.find((b) => b.text().includes('展開全部'))).toBeUndefined()
    expect(buttons.find((b) => b.text().includes('收合全部'))).toBeUndefined()
    expect(buttons.find((b) => b.text().includes('重新載入'))).toBeUndefined()
    expect(w.find('el-dropdown').exists()).toBe(true)
  })

  it('檢視選單 command：expand 填 expandedClassrooms、collapse 清空、reload 重抓總覽', async () => {
    const w = mountTab()
    await flushPromises()
    const vm = w.vm as unknown as TabVm

    vm.onViewCommand('expand')
    vm.onViewCommand('collapse')
    expect(Object.keys(vm.expandedClassrooms)).toHaveLength(0)

    const callsBefore = getFeeTemplates.mock.calls.length
    vm.onViewCommand('reload')
    await flushPromises()
    expect(getFeeTemplates.mock.calls.length).toBe(callsBefore + 1)
  })
})
