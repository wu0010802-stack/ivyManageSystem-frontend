/**
 * 月繳總表的排序控制項（依銷帳碼升冪）。
 *
 * 對帳時手上是一疊依銷帳碼排的繳款單／銀行代收檔，畫面卻是姓名序——排序切到
 * 「銷帳碼」後兩者才對得起來。班級分組刻意保留（「哪一班還沒收齊」「按班全選」
 * 都建立在分組上），只重排班內的列。
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
vi.mock('@/utils/format', () => ({ todayISO: () => '2026-08-25' }))

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
  fee_item_name: '月費 (2026-08)',
  fee_type: 'monthly',
  amount_due: 9500,
  amount_paid: 0,
  status: 'unpaid',
  payment_date: null,
  payment_method: null,
  due_date: '2026-08-30',
  billing_start_date: null,
  target_month: '2026-08',
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
  total_due: 9500,
  total_paid: 0,
  outstanding: 9500,
  billing_code_suffix: null,
  full_collection_number: null,
  items: [item({ id: 11 })],
  ...over,
})

// 後端給的順序＝班名、姓名序（ORDER BY classroom_name, student_name, id）；
// 銷帳碼刻意與姓名序不同，才看得出排序真的生效。
const STATEMENT = {
  month: '2026-08',
  students: [
    student({
      student_id: 1,
      student_name: '甲同學',
      billing_code_suffix: '4207',
      full_collection_number: '99912340004207',
      items: [item({ id: 11 })],
    }),
    student({
      student_id: 2,
      student_name: '乙同學',
      billing_code_suffix: '4203',
      full_collection_number: '99912340004203',
      items: [item({ id: 21 })],
    }),
    student({
      student_id: 3,
      student_name: '丙同學',
      billing_code_suffix: '0099',
      full_collection_number: '99912340000099',
      items: [item({ id: 31 })],
    }),
    // 非發單批次來源（手動單／現金項目）沒有銷帳碼
    student({ student_id: 4, student_name: '丁無碼', items: [item({ id: 41, source: 'manual' })] }),
    student({ student_id: 5, student_name: '戊無碼', items: [item({ id: 51, source: 'manual' })] }),
    student({
      student_id: 6,
      student_name: '己同學',
      classroom_name: '櫻花',
      billing_code_suffix: '4310',
      full_collection_number: '99912340004310',
      items: [item({ id: 61 })],
    }),
    student({
      student_id: 7,
      student_name: '庚同學',
      classroom_name: '櫻花',
      billing_code_suffix: '4101',
      full_collection_number: '99912340004101',
      items: [item({ id: 71 })],
    }),
  ],
  summary: {
    total_due: 66500,
    total_paid: 0,
    outstanding: 66500,
    student_count: 7,
    unpaid_count: 7,
    partial_count: 0,
    paid_count: 0,
  },
}

const CLASSROOMS = [
  { id: 1, name: '向日葵', grade_name: '小班' },
  { id: 2, name: '櫻花', grade_name: '中班' },
]

// 搜尋框要能 setValue，el-input 得換成原生 input（其餘 EP 元件只影響外觀）
const GLOBAL_STUBS = {
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-input': {
    props: { modelValue: { type: String, default: '' } },
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" v-bind="$attrs" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-tag': { template: '<span v-bind="$attrs"><slot /></span>' },
  'el-icon': { template: '<i aria-hidden="true"><slot /></i>' },
  'el-skeleton': { template: '<div />' },
  'el-popover': { template: '<span><slot name="reference" /></span>' },
}

const mountStatement = async () => {
  getFeeMonthlyStatement.mockResolvedValue(STATEMENT)
  const wrapper = mount(FeeMonthlyStatement, {
    props: { classrooms: CLASSROOMS },
    global: { stubs: GLOBAL_STUBS },
  })
  await flushPromises()
  return wrapper
}

const rowNames = (w: Awaited<ReturnType<typeof mountStatement>>) =>
  w.findAll('[data-test="stmt-row"]').map((r) => r.attributes('data-student'))

const groupNames = (w: Awaited<ReturnType<typeof mountStatement>>) =>
  w.findAll('[data-test="stmt-class-group"]').map((g) => g.attributes('data-classroom'))

describe('FeeMonthlyStatement — 依銷帳碼排序', () => {
  beforeEach(() => vi.clearAllMocks())

  it('預設維持後端的班名／姓名序', async () => {
    const w = await mountStatement()
    expect((w.find('[data-test="stmt-sort"]').element as HTMLSelectElement).value).toBe('default')
    // 班級分組依年段由大到小：櫻花（中班）在向日葵（小班）之前；班內維持後端姓名序
    expect(rowNames(w)).toEqual([
      '己同學',
      '庚同學',
      '甲同學',
      '乙同學',
      '丙同學',
      '丁無碼',
      '戊無碼',
    ])
  })

  it('切到銷帳碼：班內依銷帳碼升冪，無碼者沉到該班最後且維持姓名序', async () => {
    const w = await mountStatement()
    await w.find('[data-test="stmt-sort"]').setValue('code')

    expect(rowNames(w)).toEqual([
      // 櫻花（中班，排在前）：4101 < 4310
      '庚同學',
      '己同學',
      // 向日葵（小班）：0099 < 4203 < 4207，無碼兩位殿後且相對順序不變
      '丙同學',
      '乙同學',
      '甲同學',
      '丁無碼',
      '戊無碼',
    ])
  })

  it('排序不動班級分組：分組順序與表頭統計照舊', async () => {
    const w = await mountStatement()
    const before = groupNames(w)
    const headBefore = w.find('[data-test="stmt-class-group"]').text()

    await w.find('[data-test="stmt-sort"]').setValue('code')

    expect(groupNames(w)).toEqual(before)
    expect(w.find('[data-test="stmt-class-group"]').text()).toBe(headBefore)
  })

  it('切回預設即還原原本的姓名序', async () => {
    const w = await mountStatement()
    await w.find('[data-test="stmt-sort"]').setValue('code')
    await w.find('[data-test="stmt-sort"]').setValue('default')

    expect(rowNames(w)).toEqual([
      '己同學',
      '庚同學',
      '甲同學',
      '乙同學',
      '丙同學',
      '丁無碼',
      '戊無碼',
    ])
  })

  it('排序與搜尋、狀態快篩共存：篩選後的列一樣依銷帳碼排', async () => {
    const w = await mountStatement()
    await w.find('[data-test="stmt-sort"]').setValue('code')
    // 搜尋銷帳碼前綴「42」→ 只剩 4203／4207 兩位，仍是升冪
    await w.find('[data-test="stmt-search"]').setValue('42')
    await flushPromises()

    expect(rowNames(w)).toEqual(['乙同學', '甲同學'])
  })
})
