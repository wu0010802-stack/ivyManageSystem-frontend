/**
 * 繳費記錄的班級篩選（2026-07-30 根因的第八處）。
 *
 * 這個下拉特別之處：值用的是 classroom_name（後端按班名比對），不是 id。
 * 班級清單改抓跨學期後，114-2 與 115-1 各有一個「向日葵」會變成兩個一模一樣的選項
 * ——同名同值，選哪個都一樣，只是讓人以為壞了。故按班名去重。
 */
import { describe, it, expect, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'

vi.mock('@/api/fees', () => ({
  getFeeRecords: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  payFeeRecord: vi.fn(),
  getFeeSummary: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'

const CLASSROOMS = [
  { id: 24, name: '向日葵', school_year: 114, semester: 2 },
  { id: 13, name: '天堂鳥', school_year: 115, semester: 1 },
  { id: 22, name: '向日葵', school_year: 115, semester: 1 }, // 與 24 同名
]

describe('FeeRecordsTab 班級篩選選項', () => {
  it('跨學年同名班只出現一個選項（值是班名，重複無意義）', () => {
    const wrapper = shallowMount(FeeRecordsTab, {
      props: { classrooms: CLASSROOMS, periodOptions: [] },
      global: { stubs: { teleport: true, 'el-table-column': { template: '<span />' } } },
    })
    const values = wrapper
      .findAll('[data-testid="fee-classroom-option"]')
      .map(o => o.attributes('value'))
    expect(values).toEqual(['向日葵', '天堂鳥'])
  })
})
