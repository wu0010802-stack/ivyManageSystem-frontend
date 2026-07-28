import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FeeTemplateTab from '@/components/fees/FeeTemplateTab.vue'
import { FEE_TYPES } from '@/components/fees/feeTypes'

// 總覽欄位曾是硬編碼的 6 項清單，漏掉 material（代購品）與 insurance（保險費）：
// 這兩類建得出範本，卻不會出現在總覽表格、每生小計也漏算。
// 本測試鎖住「總覽欄位 == 可建範本的費別」這條不變式。

const getFeeTemplates = vi.fn(() =>
  Promise.resolve([
    { id: 1, grade_id: 1, fee_type: 'monthly', amount: 11000, is_active: true },
    { id: 2, grade_id: 1, fee_type: 'material', amount: 2500, is_active: true },
    { id: 3, grade_id: 1, fee_type: 'insurance', amount: 900, is_active: true },
  ]),
)
vi.mock('@/api/fees', () => ({
  getFeeTemplates: (...args: unknown[]) => getFeeTemplates(...args),
}))

const getGrades = vi.fn(() => Promise.resolve({ data: [{ id: 1, name: '大班', sort_order: 1 }] }))
const getClassrooms = vi.fn(() =>
  Promise.resolve({ data: [{ id: 10, name: '天堂鳥', grade_id: 1, grade_name: '大班' }] }),
)
vi.mock('@/api/classrooms', () => ({
  getGrades: (...args: unknown[]) => getGrades(...args),
  getClassrooms: (...args: unknown[]) => getClassrooms(...args),
}))

const getStudents = vi.fn(() =>
  Promise.resolve({
    data: { items: [{ id: 100, name: '小明', student_id: '115-大-01', classroom_id: 10 }] },
  }),
)
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

// 月費展開月數，與元件內 MONTHS_PER_SEMESTER 及後端 _semester_months 一致
const MONTHS_PER_SEMESTER = 6

describe('FeeTemplateTab 總覽欄位涵蓋', () => {
  it('欄位涵蓋所有可建範本的費別（含代購品與保險費）', async () => {
    const wrapper = mountTab()
    await flushPromises()

    const sections = wrapper.vm.gradeSections
    expect(sections).toHaveLength(1)
    const columns = sections[0].classrooms[0].columns as { fee_type: string }[]

    const recordFeeTypes = FEE_TYPES.filter((t) => t.source === 'record').map((t) => t.value)
    expect(columns.map((c) => c.fee_type)).toEqual(recordFeeTypes)
    // 迴歸重點：這兩項曾經整個缺席
    expect(columns.map((c) => c.fee_type)).toContain('material')
    expect(columns.map((c) => c.fee_type)).toContain('insurance')
  })

  it('代購品與保險費的金額有算進每生小計', async () => {
    const wrapper = mountTab()
    await flushPromises()

    const section = wrapper.vm.gradeSections[0]
    const columns = section.classrooms[0].columns as { fee_type: string; amount: number | null }[]
    const amountOf = (feeType: string) => columns.find((c) => c.fee_type === feeType)?.amount

    expect(amountOf('material')).toBe(2500)
    expect(amountOf('insurance')).toBe(900)
    // 月費展開六個月，其餘各一次
    expect(section.classrooms[0].per_student_total).toBe(11000 * MONTHS_PER_SEMESTER + 2500 + 900)
  })

  it('沒有範本的費別顯示為無範本且不計入小計', async () => {
    const wrapper = mountTab()
    await flushPromises()

    const columns = wrapper.vm.gradeSections[0].classrooms[0].columns as {
      fee_type: string
      amount: number | null
      detail: string | null
    }[]
    const registration = columns.find((c) => c.fee_type === 'registration')

    expect(registration?.amount).toBeNull()
    expect(registration?.detail).toBe('無範本')
  })
})
