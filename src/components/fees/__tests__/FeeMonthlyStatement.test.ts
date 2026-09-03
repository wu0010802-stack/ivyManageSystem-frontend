/**
 * FeeMonthlyStatement（月繳總表，帳單工作區「彙總繳費表」檢視）。
 *
 * - 掛載即以本月查詢並渲染 per-student 聚合列（預設只顯示未繳＋部分繳費）
 * - 狀態快篩 tiles 可切換；班級 chips 直列快篩（含未收齊人數）
 * - 費用欄位依當月出現的 fee_type 動態顯示
 * - 列上「收現金」開 StudentCashReceiptDialog；批次收款（多人繳清）仍走 BatchPayDialog
 * - 每列現金已收／網銀已收由 settlement 五桶算出（SPEC-019 §8.1）
 * - 月份導航（上一月/本月）重新查詢
 * - 展開明細列；「到逐筆明細處理」emit open-list
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getFeeMonthlyStatement = vi.fn()
const getPrepayments = vi.fn(() => Promise.resolve({ total: 0, items: [] }))
vi.mock('@/api/fees', () => ({
  getFeeMonthlyStatement: (...args: unknown[]) => getFeeMonthlyStatement(...args),
  getPrepayments: (...args: unknown[]) => getPrepayments(...args),
}))

const authMocks = vi.hoisted(() => ({ perms: new Set<string>() }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => authMocks.perms.has(name),
}))

// 固定「今天」：2026-08-25 → 本月 = 2026-08
vi.mock('@/utils/format', () => ({
  todayISO: () => '2026-08-25',
}))

vi.mock('@/components/fees/PrepaymentDrawer.vue', () => ({
  __esModule: true,
  default: { name: 'PrepaymentDrawer', template: '<div data-testid="prepay-drawer-stub" />' },
}))
vi.mock('@/components/fees/StudentCashReceiptDialog.vue', () => ({
  __esModule: true,
  default: {
    name: 'StudentCashReceiptDialog',
    props: {
      modelValue: { type: Boolean, default: false },
      studentId: { type: Number, default: null },
      studentName: { type: String, default: '' },
      month: { type: String, default: '' },
    },
    emits: ['update:modelValue', 'paid'],
    template:
      '<div data-testid="cash-dialog" :data-open="modelValue ? \'1\' : \'0\'" :data-student="studentId" :data-month="month" />',
  },
}))
vi.mock('@/components/fees/BatchPayDialog.vue', () => ({
  __esModule: true,
  default: {
    name: 'BatchPayDialog',
    props: {
      modelValue: { type: Boolean, default: false },
      records: { type: Array, default: () => [] },
    },
    emits: ['update:modelValue', 'paid'],
    template:
      '<div data-testid="batch-pay-dialog" :data-open="modelValue ? \'1\' : \'0\'" :data-ids="records.map((r) => r.id).join(\',\')" />',
  },
}))

import FeeMonthlyStatement from '@/components/fees/FeeMonthlyStatement.vue'

/** settlement 五桶（MonthlyStatementItemOut.settlement 為必填欄，預設全 0） */
const settlement = (over: Record<string, number> = {}) => ({
  cash_registered: 0,
  cash_submitted: 0,
  cash_confirmed: 0,
  bank_reconciled: 0,
  unreceipted: 0,
  ...over,
})

const item = (over: Record<string, unknown>) => ({
  fee_item_name: '月費 (2026-08)',
  fee_type: 'monthly',
  amount_due: 9500,
  amount_paid: 0,
  status: 'unpaid',
  payment_date: null,
  payment_method: null,
  due_date: '2026-08-15',
  target_month: '2026-08',
  period: '115-1',
  source: 'bill_slip',
  settlement: settlement(),
  ...over,
})

const STATEMENT = {
  month: '2026-08',
  students: [
    {
      student_id: 1,
      student_name: '林未繳',
      classroom_name: '向日葵',
      status: 'unpaid',
      total_due: 10700,
      total_paid: 0,
      outstanding: 10700,
      items: [
        item({ id: 11 }),
        item({ id: 12, fee_item_name: '教材費', fee_type: 'material', amount_due: 1200 }),
      ],
    },
    {
      student_id: 2,
      student_name: '陳部分',
      classroom_name: '向日葵',
      status: 'partial',
      total_due: 9680,
      total_paid: 9500,
      outstanding: 180,
      items: [
        item({
          id: 21,
          amount_paid: 9500,
          status: 'paid',
          payment_date: '2026-08-03',
          payment_method: '轉帳',
          settlement: settlement({ bank_reconciled: 9500 }),
        }),
        item({ id: 22, fee_item_name: '保險費', fee_type: 'insurance', amount_due: 180 }),
      ],
    },
    {
      student_id: 3,
      student_name: '張全繳',
      classroom_name: '櫻花',
      status: 'paid',
      total_due: 9500,
      total_paid: 9500,
      outstanding: 0,
      items: [
        item({
          id: 31,
          amount_paid: 9500,
          status: 'paid',
          payment_date: '2026-08-01',
          payment_method: '現金',
          settlement: settlement({ cash_confirmed: 9500 }),
        }),
      ],
    },
  ],
  summary: {
    total_due: 29880,
    total_paid: 19000,
    outstanding: 10880,
    student_count: 3,
    unpaid_count: 1,
    partial_count: 1,
    paid_count: 1,
  },
}

const CLASSROOMS = [
  { id: 1, name: '向日葵', grade_name: '小班' },
  { id: 2, name: '櫻花', grade_name: '中班' },
  // 跨學期同名班（應去重）
  { id: 3, name: '向日葵', grade_name: '小班' },
]

const GLOBAL_STUBS = {
  'el-button': {
    template: '<button type="button" v-bind="$attrs" :disabled="disabled"><slot /></button>',
    props: { disabled: { type: Boolean, default: false } },
  },
  'el-input': {
    props: { modelValue: { type: String, default: '' } },
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" v-bind="$attrs" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-tag': { template: '<span v-bind="$attrs"><slot /></span>' },
  'el-select': {
    props: { modelValue: { type: String, default: '' } },
    emits: ['update:modelValue'],
    template: '<select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
  },
  'el-option': {
    props: { value: { type: String, default: '' }, label: { type: String, default: '' } },
    template: '<option :value="value" v-bind="$attrs">{{ label }}</option>',
  },
  'el-icon': { template: '<i aria-hidden="true"><slot /></i>' },
  'el-skeleton': { template: '<div data-testid="stmt-skeleton" />' },
}

const mountStatement = (props: Record<string, unknown> = {}) =>
  mount(FeeMonthlyStatement, {
    props: { classrooms: CLASSROOMS, ...props },
    global: { stubs: GLOBAL_STUBS },
  })

const rowNames = (w: ReturnType<typeof mountStatement>) =>
  w.findAll('[data-test="stmt-row"]').map((r) => r.attributes('data-student'))

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.perms = new Set(['FEES_READ', 'FEES_WRITE'])
  getFeeMonthlyStatement.mockResolvedValue(STATEMENT)
})

describe('預設載入與聚合列', () => {
  it('掛載即以本月查詢，預設只顯示未繳＋部分繳費（該繳的人）', async () => {
    const w = mountStatement()
    await flushPromises()
    expect(getFeeMonthlyStatement).toHaveBeenCalledWith({ month: '2026-08' })
    expect(rowNames(w)).toEqual(['林未繳', '陳部分'])
    expect(w.text()).not.toContain('張全繳')
  })

  it('聚合列顯示合計/未收金額與聚合狀態', async () => {
    const w = mountStatement()
    await flushPromises()
    const row = w.find('[data-test="stmt-row"][data-student="陳部分"]')
    expect(row.text()).toContain('NT$9,680')
    expect(row.text()).toContain('NT$180')
    expect(row.text()).toContain('部分繳費')
  })

  it('費用欄依當月 fee_type 動態顯示（無註冊費/雜項欄）', async () => {
    const w = mountStatement()
    await flushPromises()
    const head = w.find('[data-test="stmt-table"] thead').text()
    expect(head).toContain('月費')
    expect(head).toContain('教材費')
    expect(head).toContain('保險費')
    expect(head).not.toContain('註冊費')
    expect(head).not.toContain('雜項')
  })

  it('summary strip 顯示本月待收與各狀態人數', async () => {
    const w = mountStatement()
    await flushPromises()
    const strip = w.find('[data-test="stmt-summary"]')
    expect(strip.text()).toContain('NT$10,880')
    expect(strip.text()).toContain('1')
  })

  // 加了現金／網銀已收兩欄後最容易錯位的地方：tfoot colspan 與展開列 colspan
  it('tfoot 與展開列的 colspan 合計等於表頭欄數（有／無 FEES_WRITE 皆然）', async () => {
    const colspanSum = (row: ReturnType<typeof mountStatement>['element'] | Element) =>
      Array.from(row.querySelectorAll('td')).reduce(
        (a, td) => a + Number(td.getAttribute('colspan') ?? 1),
        0,
      )

    for (const perms of [['FEES_READ', 'FEES_WRITE'], ['FEES_READ']]) {
      authMocks.perms = new Set(perms)
      const w = mountStatement()
      await flushPromises()
      const headCount = w.findAll('[data-test="stmt-table"] thead th').length
      const foot = w.find('[data-test="stmt-table"] tfoot tr').element
      expect(colspanSum(foot)).toBe(headCount)

      // 展開明細列以 totalColumns 跨滿整列
      await w.find('[data-test="stmt-row"][data-student="陳部分"] [data-test="stmt-expand"]').trigger('click')
      const detail = w.find('[data-test="stmt-detail"] > td')
      expect(Number(detail.attributes('colspan'))).toBe(headCount)
    }
  })
})

describe('狀態快篩與班級篩選', () => {
  it('點「已繳清」tile 後顯示已繳學生；關閉「未繳」後未繳學生隱藏', async () => {
    const w = mountStatement()
    await flushPromises()
    await w.find('[data-test="stmt-flt-paid"]').trigger('click')
    expect(rowNames(w)).toEqual(['林未繳', '陳部分', '張全繳'])
    await w.find('[data-test="stmt-flt-unpaid"]').trigger('click')
    expect(rowNames(w)).toEqual(['陳部分', '張全繳'])
  })

  it('班級下拉（去重）在選項內保留未收齊人數；選取即篩選、回全部班級即還原', async () => {
    const w = mountStatement()
    await flushPromises()
    const select = w.find('[data-test="stmt-class-select"]')
    const options = select.findAll('option')
    // 全部班級 + 向日葵 + 櫻花（跨學期同名去重）
    expect(options.map((o) => o.attributes('value'))).toEqual([
      '__all__',
      '向日葵',
      '櫻花',
    ])
    // 預設選中「全部班級」而非顯示 placeholder（el-select 空字串會被當成未選）
    expect(select.attributes('value') ?? (select.element as HTMLSelectElement).value).toBe(
      '__all__',
    )
    // 向日葵未收齊 2 人；選項文字帶年級與未收人數
    expect(options[1].text()).toContain('小班')
    expect(options[1].text()).toContain('2 人未收齊')
    expect(options[0].text()).toContain('全部班級')

    await select.setValue('向日葵')
    expect(rowNames(w)).toEqual(['林未繳', '陳部分'])
    // 櫻花只有已繳生，預設狀態下無列
    await select.setValue('櫻花')
    expect(rowNames(w)).toEqual([])
    // 回全部班級
    await select.setValue('__all__')
    expect(rowNames(w)).toEqual(['林未繳', '陳部分'])
  })

  it('篩選列顯示目前可見人數', async () => {
    const w = mountStatement()
    await flushPromises()
    expect(w.find('[data-test="stmt-visible-count"]').text()).toContain('2 人')
  })

  it('姓名搜尋即時過濾', async () => {
    const w = mountStatement()
    await flushPromises()
    await w.find('[data-test="stmt-search"]').setValue('陳')
    expect(rowNames(w)).toEqual(['陳部分'])
  })
})

describe('收款與批次收款', () => {
  it('列上「收現金」開啟 StudentCashReceiptDialog 並帶學生與月份', async () => {
    const w = mountStatement()
    await flushPromises()
    await w
      .find('[data-test="stmt-row"][data-student="陳部分"] [data-test="stmt-pay"]')
      .trigger('click')
    const dialog = w.find('[data-testid="cash-dialog"]')
    expect(dialog.attributes('data-open')).toBe('1')
    expect(dialog.attributes('data-student')).toBe('2')
    expect(dialog.attributes('data-month')).toBe('2026-08')
    expect(w.find('[data-testid="batch-pay-dialog"]').attributes('data-open')).toBe('0')
  })

  it('收現金完成（paid）後重新查詢', async () => {
    const w = mountStatement()
    await flushPromises()
    getFeeMonthlyStatement.mockClear()
    w.findComponent({ name: 'StudentCashReceiptDialog' }).vm.$emit('paid')
    await flushPromises()
    expect(getFeeMonthlyStatement).toHaveBeenCalledWith({ month: '2026-08' })
  })

  it('每列顯示現金已收／網銀已收（由 settlement 五桶算出）', async () => {
    const w = mountStatement()
    await flushPromises()
    const row = w.find('[data-test="stmt-row"][data-student="陳部分"]')
    expect(row.find('[data-test="stmt-bank-paid"]').text()).toContain('9,500')
    expect(row.find('[data-test="stmt-cash-paid"]').text()).toBe('—')

    // 全繳生走現金（cash_confirmed）：現金欄有值、網銀欄為 —
    await w.find('[data-test="stmt-flt-paid"]').trigger('click')
    const paidRow = w.find('[data-test="stmt-row"][data-student="張全繳"]')
    expect(paidRow.find('[data-test="stmt-cash-paid"]').text()).toContain('9,500')
    expect(paidRow.find('[data-test="stmt-bank-paid"]').text()).toBe('—')
  })

  it('批次收款預設 disabled；勾選後帶所有勾選學生的未繳項目', async () => {
    const w = mountStatement()
    await flushPromises()
    const batchBtn = w.find('[data-test="stmt-batch-pay"]')
    expect(batchBtn.attributes('disabled')).toBeDefined()

    await w.find('[data-test="stmt-row"][data-student="林未繳"] [data-test="stmt-check"]').setValue(true)
    await w.find('[data-test="stmt-row"][data-student="陳部分"] [data-test="stmt-check"]').setValue(true)
    expect(w.find('[data-test="stmt-batch-pay"]').text()).toContain('2')
    await w.find('[data-test="stmt-batch-pay"]').trigger('click')
    expect(w.find('[data-testid="batch-pay-dialog"]').attributes('data-ids')).toBe('11,12,22')
  })

  it('已繳清學生的列不可勾選、無收款鈕', async () => {
    const w = mountStatement()
    await flushPromises()
    await w.find('[data-test="stmt-flt-paid"]').trigger('click')
    const paidRow = w.find('[data-test="stmt-row"][data-student="張全繳"]')
    expect(paidRow.find('[data-test="stmt-check"]').attributes('disabled')).toBeDefined()
    expect(paidRow.find('[data-test="stmt-pay"]').exists()).toBe(false)
  })

  it('批次收款完成（paid）後重新查詢', async () => {
    const w = mountStatement()
    await flushPromises()
    getFeeMonthlyStatement.mockClear()
    const dialog = w.findComponent({ name: 'BatchPayDialog' })
    dialog.vm.$emit('paid')
    await flushPromises()
    expect(getFeeMonthlyStatement).toHaveBeenCalledWith({ month: '2026-08' })
  })

  it('無 FEES_WRITE 時不顯示勾選欄/收款/批次收款', async () => {
    authMocks.perms = new Set(['FEES_READ'])
    const w = mountStatement()
    await flushPromises()
    expect(w.find('[data-test="stmt-batch-pay"]').exists()).toBe(false)
    expect(w.find('[data-test="stmt-check"]').exists()).toBe(false)
    expect(w.find('[data-test="stmt-pay"]').exists()).toBe(false)
  })
})

describe('月份導航', () => {
  it('上一月重新查詢；「本月」在當月時 disabled、切走後可返回', async () => {
    const w = mountStatement()
    await flushPromises()
    expect(
      w.find('[data-test="stmt-month-current"]').attributes('disabled'),
    ).toBeDefined()

    await w.find('[data-test="stmt-month-prev"]').trigger('click')
    await flushPromises()
    expect(getFeeMonthlyStatement).toHaveBeenLastCalledWith({ month: '2026-07' })
    expect(w.find('[data-test="stmt-month-label"]').text()).toContain('115 年 7 月')

    await w.find('[data-test="stmt-month-current"]').trigger('click')
    await flushPromises()
    expect(getFeeMonthlyStatement).toHaveBeenLastCalledWith({ month: '2026-08' })
  })

  it('跨年往前導航正確（2026-01 → 2025-12）', async () => {
    const w = mountStatement()
    await flushPromises()
    for (let i = 0; i < 8; i += 1) {
      await w.find('[data-test="stmt-month-prev"]').trigger('click')
    }
    await flushPromises()
    expect(getFeeMonthlyStatement).toHaveBeenLastCalledWith({ month: '2025-12' })
  })
})

describe('展開明細', () => {
  it('點列展開單項明細；「到逐筆明細處理」emit open-list（帶學生姓名）', async () => {
    const w = mountStatement()
    await flushPromises()
    await w.find('[data-test="stmt-row"][data-student="陳部分"] [data-test="stmt-expand"]').trigger('click')
    const detail = w.find('[data-test="stmt-detail"]')
    expect(detail.exists()).toBe(true)
    expect(detail.text()).toContain('保險費')
    expect(detail.text()).toContain('轉帳')

    await detail.find('[data-test="stmt-open-list"]').trigger('click')
    expect(w.emitted('open-list')).toEqual([['陳部分']])
  })
})

describe('載入狀態', () => {
  it('查詢失敗顯示錯誤與重試；重試成功恢復列表', async () => {
    getFeeMonthlyStatement.mockRejectedValueOnce(new Error('boom'))
    const w = mountStatement()
    await flushPromises()
    expect(w.find('[data-test="stmt-error"]').exists()).toBe(true)

    getFeeMonthlyStatement.mockResolvedValue(STATEMENT)
    await w.find('[data-test="stmt-retry"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="stmt-error"]').exists()).toBe(false)
    expect(rowNames(w)).toEqual(['林未繳', '陳部分'])
  })

  it('當月無資料顯示空狀態提示', async () => {
    getFeeMonthlyStatement.mockResolvedValue({
      month: '2026-08',
      students: [],
      summary: {
        total_due: 0,
        total_paid: 0,
        outstanding: 0,
        student_count: 0,
        unpaid_count: 0,
        partial_count: 0,
        paid_count: 0,
      },
    })
    const w = mountStatement()
    await flushPromises()
    expect(w.find('[data-test="stmt-empty"]').exists()).toBe(true)
    // SPEC-019：應收唯一來源＝發單批次，空狀態導向匯入檢核檔
    expect(w.find('[data-test="stmt-empty"]').text()).toContain('匯入繳款單檢核檔')
    await w.find('[data-test="stmt-empty-import"]').trigger('click')
    expect(w.emitted('open-imports')).toBeTruthy()
  })
})
