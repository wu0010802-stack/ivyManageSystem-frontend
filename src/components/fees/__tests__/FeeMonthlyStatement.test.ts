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
vi.mock('@/components/fees/FeeCollectionDetailDialog.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeCollectionDetailDialog',
    props: {
      modelValue: { type: Boolean, default: false },
      recordIds: { type: Array, default: () => [] },
      studentName: { type: String, default: '' },
      month: { type: String, default: '' },
    },
    emits: ['update:modelValue'],
    template:
      '<div data-testid="coll-dialog" :data-open="modelValue ? \'1\' : \'0\'" :data-ids="recordIds.join(\',\')" :data-student="studentName" :data-month="month" />',
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
    expect(row.text()).toContain('9,680')
    expect(row.text()).toContain('180')
    expect(row.text()).toContain('部分繳費')
    // 表格儲存格不重複幣別前綴（幣別由分組表頭與合計列標示）
    expect(row.text()).not.toContain('NT$')
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

  it('班級以導覽列（非下拉）呈現，chip 帶未收人數／已收齊，跨學期同名班去重', async () => {
    const w = mountStatement()
    await flushPromises()
    expect(w.find('[data-test="stmt-class-select"]').exists()).toBe(false)
    const rail = w.find('[data-test="stmt-class-rail"]')
    expect(rail.exists()).toBe(true)

    const chips = rail.findAll('[data-test="stmt-class-rail-class"]')
    expect(chips.map((c) => c.attributes('data-classroom'))).toEqual(['向日葵', '櫻花'])
    // 向日葵 2 人未收齊；櫻花全繳清顯示勾號而非數字
    expect(chips[0].find('[data-test="rail-owe"]').text()).toBe('2')
    expect(chips[1].find('[data-test="rail-ok"]').exists()).toBe(true)
    // 年段來自班級清單
    expect(rail.findAll('[data-test="stmt-class-rail-grade"]').map((g) => g.text())).toEqual([
      expect.stringContaining('小班'),
      expect.stringContaining('中班'),
    ])
  })

  it('點班級 chip 即篩選；再點一次回全部', async () => {
    const w = mountStatement()
    await flushPromises()
    const chip = (name: string) =>
      w.find(`[data-test="stmt-class-rail-class"][data-classroom="${name}"]`)

    await chip('向日葵').trigger('click')
    expect(rowNames(w)).toEqual(['林未繳', '陳部分'])
    // 櫻花只有已繳生，預設狀態下無列
    await chip('櫻花').trigger('click')
    expect(rowNames(w)).toEqual([])
    await chip('櫻花').trigger('click')
    expect(rowNames(w)).toEqual(['林未繳', '陳部分'])
  })

  it('點年段標籤篩選整個年段', async () => {
    const w = mountStatement()
    await flushPromises()
    await w.findAll('[data-test="stmt-class-rail-grade"]')[1].trigger('click')
    // 中班＝櫻花（只有已繳生）
    expect(rowNames(w)).toEqual([])
    await w.findAll('[data-test="stmt-class-rail-grade"]')[0].trigger('click')
    expect(rowNames(w)).toEqual(['林未繳', '陳部分'])
  })

  it('班名與班級清單不一致（向日葵班 vs 向日葵）時，未收人數仍算得出來', async () => {
    // staging 實況：月表回「向日葵班」、班級清單是「向日葵」。改版前這裡歸零成「已收齊」
    getFeeMonthlyStatement.mockResolvedValue({
      ...STATEMENT,
      students: STATEMENT.students.map((s) =>
        s.classroom_name === '向日葵' ? { ...s, classroom_name: '向日葵班' } : s,
      ),
    })
    const w = mountStatement()
    await flushPromises()
    const chip = w.find('[data-test="stmt-class-rail-class"][data-classroom="向日葵班"]')
    expect(chip.exists()).toBe(true)
    expect(chip.find('[data-test="rail-owe"]').text()).toBe('2')
    expect(chip.attributes('title')).toContain('小班')
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

describe('表格依班級分組', () => {
  const groups = (w: ReturnType<typeof mountStatement>) =>
    w.findAll('[data-test="stmt-class-group"]')

  it('班級欄從表頭移除（班名改由分組表頭標示）', async () => {
    const w = mountStatement()
    await flushPromises()
    const heads = w.findAll('[data-test="stmt-table"] thead th').map((t) => t.text())
    expect(heads).not.toContain('班級')
    expect(heads).toContain('學生')
  })

  it('每班一條分組表頭，顯示班名、年段、人數與未收小計', async () => {
    const w = mountStatement()
    await flushPromises()
    const g = groups(w)
    expect(g.map((x) => x.attributes('data-classroom'))).toEqual(['向日葵', '櫻花'])
    expect(g[0].text()).toContain('向日葵')
    expect(g[0].text()).toContain('小班')
    // 向日葵 2 人、未收 10,700 + 180
    expect(g[0].text()).toContain('2 人')
    expect(g[0].text()).toContain('NT$10,880')
  })

  it('已收齊的班仍留一條表頭（標示已收齊），不因篩選後無列而整組消失', async () => {
    const w = mountStatement()
    await flushPromises()
    const sakura = w.find('[data-test="stmt-class-group"][data-classroom="櫻花"]')
    expect(sakura.exists()).toBe(true)
    expect(sakura.text()).toContain('本班收齊')
    // 已收齊的班不再贅述「篩選後 0 人」
    expect(sakura.text()).not.toContain('篩選後')
    // 預設篩選下該班沒有列，但表頭在
    expect(rowNames(w)).toEqual(['林未繳', '陳部分'])
  })

  it('打開「已繳清」快篩後，已收齊的班直接顯示學生（不被收合擋住）', async () => {
    const w = mountStatement()
    await flushPromises()
    await w.find('[data-test="stmt-flt-paid"]').trigger('click')
    expect(rowNames(w)).toEqual(['林未繳', '陳部分', '張全繳'])
  })

  it('分組表頭可手動收合／展開該班', async () => {
    const w = mountStatement()
    await flushPromises()
    const toggle = () =>
      w.find(
        '[data-test="stmt-class-group"][data-classroom="向日葵"] [data-test="stmt-group-toggle"]',
      )
    await toggle().trigger('click')
    expect(rowNames(w)).toEqual([])
    expect(
      w.find('[data-test="stmt-class-group"][data-classroom="向日葵"]').attributes('data-collapsed'),
    ).toBe('1')

    await toggle().trigger('click')
    expect(rowNames(w)).toEqual(['林未繳', '陳部分'])
  })

  it('分組表頭「全選本班未收」只勾該班未繳清的學生', async () => {
    const w = mountStatement()
    await flushPromises()
    await w.find('[data-test="stmt-flt-paid"]').trigger('click')

    await w
      .find('[data-test="stmt-class-group"][data-classroom="向日葵"] [data-test="stmt-group-check"]')
      .setValue(true)
    expect(w.find('[data-test="stmt-batch-pay"]').text()).toContain('2')

    // 已收齊的班沒有可勾的人，不渲染全選
    expect(
      w
        .find('[data-test="stmt-class-group"][data-classroom="櫻花"] [data-test="stmt-group-check"]')
        .exists(),
    ).toBe(false)

    await w.find('[data-test="stmt-batch-pay"]').trigger('click')
    expect(w.find('[data-testid="batch-pay-dialog"]').attributes('data-ids')).toBe('11,12,22')
  })

  it('選定班級但篩選後無列時，顯示該班的空狀態而非整表空白', async () => {
    const w = mountStatement()
    await flushPromises()
    await w
      .find('[data-test="stmt-class-rail-class"][data-classroom="櫻花"]')
      .trigger('click')
    expect(groups(w)).toHaveLength(1)
    expect(w.find('[data-test="stmt-no-match"]').exists()).toBe(true)
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

describe('檢視收款明細', () => {
  it('表頭有「檢視」欄，每列一顆檢視鈕；點下帶該生本月所有帳款 id 開彈窗', async () => {
    const w = mountStatement()
    await flushPromises()
    expect(w.find('[data-test="stmt-table"] thead').text()).toContain('檢視')
    expect(w.findAll('[data-test="stmt-view"]')).toHaveLength(2)

    const dialog = w.find('[data-testid="coll-dialog"]')
    expect(dialog.attributes('data-open')).toBe('0')
    await w
      .find('[data-test="stmt-row"][data-student="陳部分"] [data-test="stmt-view"]')
      .trigger('click')
    expect(dialog.attributes('data-open')).toBe('1')
    expect(dialog.attributes('data-ids')).toBe('21,22')
    expect(dialog.attributes('data-student')).toBe('陳部分')
    expect(dialog.attributes('data-month')).toBe('2026-08')
    // 檢視是唯讀動作，不該順手開收款 dialog
    expect(w.find('[data-testid="cash-dialog"]').attributes('data-open')).toBe('0')
  })

  it('只有 FEES_READ 也能檢視（唯讀欄不受寫入權限影響）', async () => {
    authMocks.perms = new Set(['FEES_READ'])
    const w = mountStatement()
    await flushPromises()
    expect(w.find('[data-test="stmt-table"] thead').text()).toContain('檢視')
    expect(w.findAll('[data-test="stmt-view"]')).toHaveLength(2)
    await w.find('[data-test="stmt-view"]').trigger('click')
    expect(w.find('[data-testid="coll-dialog"]').attributes('data-open')).toBe('1')
  })

  it('已繳清的列同樣可檢視（看是誰收的）', async () => {
    const w = mountStatement()
    await flushPromises()
    await w.find('[data-test="stmt-flt-paid"]').trigger('click')
    const paidRow = w.find('[data-test="stmt-row"][data-student="張全繳"]')
    expect(paidRow.find('[data-test="stmt-view"]').exists()).toBe(true)
    await paidRow.find('[data-test="stmt-view"]').trigger('click')
    expect(w.find('[data-testid="coll-dialog"]').attributes('data-ids')).toBe('31')
  })
})
