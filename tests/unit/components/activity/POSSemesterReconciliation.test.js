// High（2026-06-24 code review）：POS 學期對帳後端在報名數超過上限時回
// truncated / total_active，且測試明確要求不可無聲截斷。前端原本只讀 items / totals
// 並把部分合計直接當全學期總計顯示 → 對帳者會在不知情下看到「少算」的數字。
// 本測試鎖定：truncated 時必須出現警告且把 totals 標為「部分合計」；未截斷時不顯示。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getPOSSemesterReconciliation = vi.fn()
vi.mock('@/api/activity', () => ({
  getPOSSemesterReconciliation: (...a) => getPOSSemesterReconciliation(...a),
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn(() => Promise.resolve({ data: { items: [] } })),
}))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 115, semester: 1 }),
}))

import POSSemesterReconciliation from '@/components/activity/POSSemesterReconciliation.vue'

const STUBS = {
  AcademicTermSelector: true,
  StatCard: {
    props: ['label', 'value'],
    template: '<div class="stat-card">{{ label }}:{{ value }}</div>',
  },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-button': { template: '<button><slot /></button>' },
  'el-table': { template: '<table><slot /></table>' },
  'el-table-column': true,
  'el-tag': { template: '<span><slot /></span>' },
  'el-empty': true,
}

function mountWith(resData) {
  getPOSSemesterReconciliation.mockResolvedValue({ data: resData })
  return mount(POSSemesterReconciliation, {
    global: { stubs: STUBS, directives: { loading: {} } },
  })
}

const ITEMS = [
  {
    id: 1,
    student_name: '甲',
    class_name: '海豚',
    is_active: true,
    course_names: [],
    total_amount: 2000,
    paid_amount: 2000,
    owed: 0,
    payment_status: 'paid',
    approval_status: 'fully_approved',
    approved_paid_amount: 2000,
    pending_paid_amount: 0,
    offline_paid_amount: 0,
    latest_payment_date: '2026-04-01',
    created_at: '2026-04-01T00:00:00',
  },
]

describe('POSSemesterReconciliation 截斷警告', () => {
  beforeEach(() => {
    getPOSSemesterReconciliation.mockReset()
  })

  it('truncated=true 時顯示警告並標示為部分合計（含總筆數）', async () => {
    const wrapper = mountWith({
      truncated: true,
      total_active: 2500,
      items: ITEMS,
      totals: { registration_count: 1, total_amount: 2000 },
    })
    await flushPromises()
    const warn = wrapper.find('.pos-semester__trunc-warn')
    expect(warn.exists()).toBe(true)
    // 必須揭露總筆數 2500，讓對帳者知道表不完整
    expect(warn.text()).toContain('2500')
    // 必須明確標示為「部分合計」而非全學期總計
    expect(wrapper.text()).toContain('部分合計')
  })

  it('truncated=false（未截斷）時不顯示警告', async () => {
    const wrapper = mountWith({
      truncated: false,
      total_active: 1,
      items: ITEMS,
      totals: { registration_count: 1, total_amount: 2000 },
    })
    await flushPromises()
    expect(wrapper.find('.pos-semester__trunc-warn').exists()).toBe(false)
  })
})
