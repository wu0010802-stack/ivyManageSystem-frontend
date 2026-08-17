/**
 * FeeTemplateTab toolbar 收斂（2026-08-17 UI/UX 重構）：
 * 頂層最多 3 個 action——產生費用單（primary）、管理範本（secondary）、檢視選單
 * （展開全部／收合全部／重新載入收進 dropdown）；產單 modal 繼承目前選定學年/學期。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import FeeTemplateTab from '@/components/fees/FeeTemplateTab.vue'
import FeeGenerateModal from '@/components/fees/FeeGenerateModal.vue'

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
        FeeGenerateModal: true,
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

describe('FeeTemplateTab toolbar 收斂', () => {
  it('產生費用單為 primary；管理範本非 primary；展開/收合/重新載入不再是頂層按鈕', async () => {
    const w = mountTab()
    await flushPromises()

    const buttons = w.findAll('el-button')
    const generateBtn = buttons.find((b) => b.text().includes('產生費用單'))
    const manageBtn = buttons.find((b) => b.text().includes('管理範本'))
    expect(generateBtn).toBeTruthy()
    expect(generateBtn!.attributes('type')).toBe('primary')
    expect(manageBtn).toBeTruthy()
    expect(manageBtn!.attributes('type')).not.toBe('primary')

    // 三個檢視動作收進 dropdown（不再是頂層 el-button）
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
    // 沒班級資料時仍應可呼叫（空 map），collapse 清空
    vm.onViewCommand('collapse')
    expect(Object.keys(vm.expandedClassrooms)).toHaveLength(0)

    const callsBefore = getFeeTemplates.mock.calls.length
    vm.onViewCommand('reload')
    await flushPromises()
    expect(getFeeTemplates.mock.calls.length).toBe(callsBefore + 1)
  })

  it('FeeGenerateModal 繼承 FeeTemplateTab 目前選定的 schoolYear/semester', async () => {
    const w = mountTab()
    await flushPromises()
    const vm = w.vm as unknown as TabVm
    vm.filterYear = 116
    vm.filterSemester = 2
    await flushPromises()

    const modal = w.findComponent(FeeGenerateModal)
    expect(modal.exists()).toBe(true)
    expect(modal.props('schoolYear')).toBe(116)
    expect(modal.props('semester')).toBe(2)
  })
})
