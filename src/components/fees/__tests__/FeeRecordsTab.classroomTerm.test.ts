/**
 * 繳費記錄的班級篩選（2026-07-30 根因的第八處）。
 *
 * 這個篩選特別之處：值用的是 classroom_name（後端按班名比對），不是 id。
 * 班級清單改抓跨學期後，114-2 與 115-1 各有一個「向日葵」會變成兩個一模一樣的選項
 * ——同名同值，選哪個都一樣，只是讓人以為壞了。故按班名去重。
 *
 * 2026-09-03 起下拉改為班級導覽列（與月表共用元件）。逐筆走伺服器分頁、算不出
 * 整月未收人數，故 show-counts 關閉——畫出恆為 0 的計數比不畫更糟。
 */
import { describe, it, expect, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'

// api wrapper 已回解包後的 body（不是 axios response），選班級會觸發查詢，
// 故 mock 必須是真實形狀，否則 fetchRecords 讀 items 會炸
vi.mock('@/api/fees', () => ({
  getFeeRecords: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  payFeeRecord: vi.fn(),
  getFeeSummary: vi.fn().mockResolvedValue({
    total_count: 0,
    total_due: 0,
    total_paid: 0,
    paid_count: 0,
    partial_count: 0,
    unpaid_count: 0,
    total_unpaid: 0,
  }),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'
import FeeClassRail from '@/components/fees/FeeClassRail.vue'

const CLASSROOMS = [
  { id: 24, name: '向日葵', school_year: 114, semester: 2, grade_name: '幼幼班' },
  { id: 13, name: '天堂鳥', school_year: 115, semester: 1, grade_name: '大班' },
  { id: 22, name: '向日葵', school_year: 115, semester: 1, grade_name: '幼幼班' }, // 與 24 同名
]

const mountTab = () =>
  shallowMount(FeeRecordsTab, {
    props: { classrooms: CLASSROOMS, periodOptions: [] },
    global: { stubs: { teleport: true, 'el-table-column': { template: '<span />' } } },
  })

describe('FeeRecordsTab 班級篩選', () => {
  it('班級改用導覽列，不再是下拉', () => {
    const wrapper = mountTab()
    expect(wrapper.findComponent(FeeClassRail).exists()).toBe(true)
    expect(wrapper.find('[data-testid="fee-classroom-option"]').exists()).toBe(false)
  })

  it('跨學年同名班只出現一次（值是班名，重複無意義），並依年段分組', () => {
    const rail = mountTab().findComponent(FeeClassRail)
    const groups = rail.props('groups') as Array<{
      label: string
      classes: Array<{ name: string }>
    }>
    expect(groups.map((g) => g.label)).toEqual(['幼幼班', '大班'])
    expect(groups.flatMap((g) => g.classes).map((c) => c.name)).toEqual(['向日葵', '天堂鳥'])
  })

  it('伺服器分頁算不出整月未收，故不顯示人數', () => {
    expect(mountTab().findComponent(FeeClassRail).props('showCounts')).toBe(false)
  })

  it('選班級即套用 classroom_name 篩選，再選一次回全部', async () => {
    const wrapper = mountTab()
    const rail = wrapper.findComponent(FeeClassRail)

    rail.vm.$emit('select', { cls: '向日葵', grade: '幼幼班' })
    await wrapper.vm.$nextTick()
    expect(rail.props('selectedClass')).toBe('向日葵')

    rail.vm.$emit('select', { cls: null, grade: null })
    await wrapper.vm.$nextTick()
    expect(rail.props('selectedClass')).toBe(null)
  })
})
