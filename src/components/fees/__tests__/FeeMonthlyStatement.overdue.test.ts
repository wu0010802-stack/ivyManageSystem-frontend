/**
 * SPEC-015 逾期衍生標註（月繳總表）：
 * - 任一費用項 due_date 已過且未繳清 → 學生列顯示「逾期」tag
 * - 逾期 tile 顯示人數；點擊後只顯示逾期學生（與狀態快篩正交）
 * - 已繳清的過期項不算逾期
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getFeeMonthlyStatement = vi.fn()
const getPrepayments = vi.fn(() => Promise.resolve({ total: 0, items: [] }))
vi.mock('@/api/fees', () => ({
  getFeeMonthlyStatement: (...args: unknown[]) => getFeeMonthlyStatement(...args),
  getPrepayments: (...args: unknown[]) => getPrepayments(...args),
}))

vi.mock('@/utils/auth', () => ({ hasPermission: () => false }))

// 固定「今天」：2026-08-25
vi.mock('@/utils/format', () => ({
  todayISO: () => '2026-08-25',
}))

vi.mock('@/components/fees/PrepaymentDrawer.vue', () => ({
  __esModule: true,
  default: { name: 'PrepaymentDrawer', template: '<div />' },
}))
vi.mock('@/components/fees/StudentCashReceiptDialog.vue', () => ({
  __esModule: true,
  default: { name: 'StudentCashReceiptDialog', template: '<div />' },
}))
vi.mock('@/components/fees/BatchPayDialog.vue', () => ({
  __esModule: true,
  default: { name: 'BatchPayDialog', template: '<div />' },
}))

import FeeMonthlyStatement from '@/components/fees/FeeMonthlyStatement.vue'

const item = (over: Record<string, unknown>) => ({
  fee_item_name: '註冊費',
  fee_type: 'registration',
  amount_due: 17000,
  amount_paid: 0,
  status: 'unpaid',
  payment_date: null,
  payment_method: null,
  due_date: '2026-08-15',
  billing_start_date: '2026-08-01',
  target_month: null,
  period: '115-1',
  source: 'bill_slip',
  settlement: {
    cash_registered: 0,
    cash_submitted: 0,
    cash_confirmed: 0,
    bank_reconciled: 0,
    unreceipted: 0,
  },
  ...over,
})

const student = (over: Record<string, unknown>) => ({
  student_id: 1,
  student_name: '學生',
  classroom_name: '向日葵',
  status: 'unpaid',
  total_due: 17000,
  total_paid: 0,
  outstanding: 17000,
  items: [item({ id: 11 })],
  ...over,
})

const STATEMENT = {
  month: '2026-08',
  students: [
    // 逾期：due 8/15 < 今天 8/25 且未繳
    student({ student_id: 1, student_name: '林逾期' }),
    // 未逾期：due 8/30 還沒到
    student({
      student_id: 2,
      student_name: '陳未到期',
      items: [item({ id: 21, due_date: '2026-08-30' })],
    }),
    // 過期但已繳清該項 → 不算逾期
    student({
      student_id: 3,
      student_name: '王繳清',
      status: 'paid',
      total_paid: 17000,
      outstanding: 0,
      items: [item({ id: 31, status: 'paid', amount_paid: 17000 })],
    }),
  ],
  summary: {
    total_due: 51000,
    total_paid: 17000,
    outstanding: 34000,
    student_count: 3,
    unpaid_count: 2,
    partial_count: 0,
    paid_count: 1,
  },
}

const mountStatement = async () => {
  getFeeMonthlyStatement.mockResolvedValue(STATEMENT)
  const wrapper = mount(FeeMonthlyStatement, { props: { classrooms: [] } })
  await flushPromises()
  return wrapper
}

describe('FeeMonthlyStatement — SPEC-015 逾期標註', () => {
  beforeEach(() => vi.clearAllMocks())

  it('逾期學生列顯示「逾期」tag；未到期與已繳清不顯示', async () => {
    const wrapper = await mountStatement()
    const rows = wrapper.findAll('[data-test="stmt-row"]')
    const rowOf = (name: string) => rows.find((r) => r.attributes('data-student') === name)!
    expect(rowOf('林逾期').find('[data-test="stmt-overdue-tag"]').exists()).toBe(true)
    expect(rowOf('陳未到期').find('[data-test="stmt-overdue-tag"]').exists()).toBe(false)
  })

  it('逾期 tile 計人數（scope 全月），點擊後只顯示逾期學生', async () => {
    const wrapper = await mountStatement()
    const tile = wrapper.find('[data-test="stmt-flt-overdue"]')
    expect(tile.text()).toContain('1')

    await tile.trigger('click')
    const rows = wrapper.findAll('[data-test="stmt-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].attributes('data-student')).toBe('林逾期')

    // 再點一次取消，回復預設（未繳＋部分繳費可見）
    await tile.trigger('click')
    expect(wrapper.findAll('[data-test="stmt-row"]').length).toBeGreaterThan(1)
  })
})

describe('FeeMonthlyStatement — 篩選後整表無列時的說明', () => {
  beforeEach(() => vi.clearAllMocks())

  // 回歸：逾期 0 人時 visibleStudents 為空，但分組表頭仍逐班列出（表頭統計講的是
  // 收款狀況，與逾期無關）→ 畫面只剩一排無關數字、沒有任何一句話說明為什麼沒有列。
  it('逾期快篩 0 人：明說沒有逾期學生，不留一排與逾期無關的班級表頭', async () => {
    getFeeMonthlyStatement.mockResolvedValue({
      ...STATEMENT,
      students: [STATEMENT.students[1], STATEMENT.students[2]],
    })
    const w = mount(FeeMonthlyStatement, { props: { classrooms: [] } })
    await flushPromises()

    await w.find('[data-test="stmt-flt-overdue"]').trigger('click')
    expect(w.findAll('[data-test="stmt-row"]').length).toBe(0)
    expect(w.findAll('[data-test="stmt-class-group"]').length).toBe(0)
    expect(w.find('[data-test="stmt-no-match"]').text()).toContain('沒有逾期')
  })

  it('狀態快篩把人全篩掉時說出是狀態造成的', async () => {
    getFeeMonthlyStatement.mockResolvedValue({
      ...STATEMENT,
      students: [STATEMENT.students[2]],
    })
    const w = mount(FeeMonthlyStatement, { props: { classrooms: [] } })
    await flushPromises()

    // 預設關「已繳清」，範圍內只有一位已繳清學生 → 一列都不會通過
    expect(w.findAll('[data-test="stmt-row"]').length).toBe(0)
    expect(w.find('[data-test="stmt-no-match"]').text()).toContain('已收齊')
  })
})
