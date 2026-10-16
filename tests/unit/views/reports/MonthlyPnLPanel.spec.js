/**
 * MonthlyPnLPanel.spec.js
 *
 * 驗證月度損益表 panel：
 *  1. 渲染所有 sections 與 rows
 *  2. 年度切換 prop 觸發 refetch
 *  3. pending_items 渲染為註腳條列（2026-10-12 改版：不再用 el-alert）
 *  4. 結餘負數顯示紅色（class，合計列在 tfoot）
 *  5. 小計列加粗（is_subtotal → row-subtotal class）
 *  6. 金額千分位格式
 *  7. unit='person'/'class' 後綴；unit='amount' 0 → '—'；未來月金額留白
 *
 * 2026-10-12 改版後，隱藏全年為 0 的列、欄位狀態、月份焦點、tfoot 等新行為
 * 由 src/views/reports/__tests__/MonthlyPnLPanel.spec.ts 覆蓋；本檔保留舊不變式。
 *
 * Mock pattern 模仿 tests/unit/api/reports.test.js 的 vi.hoisted 寫法，
 * 避免直接接 axios。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

const { mockGetMonthlyPnL } = vi.hoisted(() => ({
  mockGetMonthlyPnL: vi.fn(),
}))

vi.mock('@/api/reports', () => ({
  getMonthlyPnL: mockGetMonthlyPnL,
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

import MonthlyPnLPanel from '@/views/reports/MonthlyPnLPanel.vue'

// 最小 fixture：兩個 section（含 subtotal 列）+ totals + pending_items
function makeFixture() {
  return {
    year: 2026,
    sections: [
      {
        key: 'stats',
        label: '統計指標',
        rows: [
          {
            key: 'classroom_count',
            label: '班級數',
            unit: 'class',
            monthly: [8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9],
            total: null,
            is_subtotal: false,
          },
        ],
      },
      {
        key: 'income',
        label: '收入',
        rows: [
          {
            key: 'income_cash',
            label: '現金繳費',
            unit: 'amount',
            monthly: [100000, 200000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            total: 300000,
            is_subtotal: false,
          },
          {
            key: 'income_subtotal',
            label: '收入合計（毛收入）',
            unit: 'amount',
            monthly: [100000, 200000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            total: 300000,
            is_subtotal: true,
          },
          {
            key: 'income_registration',
            label: '費別切片：新生註冊費',
            unit: 'amount',
            monthly: [50000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            total: 50000,
            is_subtotal: false,
            is_breakdown: true,
          },
        ],
      },
    ],
    totals: {
      income_total: {
        monthly: [100000, 200000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        total: 300000,
      },
      refund_total: {
        monthly: [0, 5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        total: 5000,
      },
      expense_total: {
        monthly: [50000, 250000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        total: 300000,
      },
      net_cashflow: {
        monthly: [50000, -55000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        total: -5000,
      },
    },
    pending_items: [
      '全校節慶人數（user 自訂指標，未對應 schema）',
      '預繳收入（招生階段 deposit 不在 fee_payment 流水）',
    ],
  }
}

// Element Plus 元件 stub（避免完整 mount Element Plus）
const makeStub = (tag, opts = {}) =>
  defineComponent({
    name: tag,
    props: opts.props || [],
    setup(_, { slots }) {
      return () => h('div', { class: tag.toLowerCase() }, [
        slots.title?.(),
        slots.default?.(),
      ])
    },
  })

const globalConfig = {
  components: {
    ElSkeleton: makeStub('ElSkeleton'),
    ElEmpty: defineComponent({
      name: 'ElEmpty',
      props: ['description'],
      setup(props, { slots }) {
        return () => h('div', { class: 'el-empty' }, [
          slots.default?.() || props.description,
        ])
      },
    }),
    ElSwitch: defineComponent({
      name: 'ElSwitch',
      props: ['modelValue', 'size', 'ariaLabel'],
      emits: ['update:modelValue'],
      setup() {
        return () => h('div', { class: 'el-switch' })
      },
    }),
    ElButton: defineComponent({
      name: 'ElButton',
      props: ['type', 'size'],
      setup(_, { slots }) {
        return () => h('button', { class: 'el-button' }, slots.default?.())
      },
    }),
  },
  stubs: { 'router-link': RouterLinkStub },
}

describe('MonthlyPnLPanel', () => {
  beforeEach(() => {
    mockGetMonthlyPnL.mockReset()
    // 欄位狀態（過去／本月／未來）依今天決定；固定為 2026-10-12：1–9 月過去、10 月本月、11–12 月未來
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('掛載時依 year 呼叫 getMonthlyPnL 並渲染所有 sections + rows', async () => {
    mockGetMonthlyPnL.mockResolvedValueOnce(makeFixture())
    const w = mount(MonthlyPnLPanel, {
      props: { year: 2026, focusMonth: 10 },
      global: globalConfig,
    })
    await flushPromises()

    expect(mockGetMonthlyPnL).toHaveBeenCalledWith(2026)
    const text = w.text()
    expect(text).toContain('統計指標')
    expect(text).toContain('班級數')
    expect(text).toContain('收入')
    expect(text).toContain('現金繳費')
    expect(text).toContain('收入合計')
  })

  it('年度切換 prop 變化會觸發 refetch', async () => {
    mockGetMonthlyPnL.mockResolvedValue(makeFixture())
    const w = mount(MonthlyPnLPanel, {
      props: { year: 2025, focusMonth: 10 },
      global: globalConfig,
    })
    await flushPromises()
    expect(mockGetMonthlyPnL).toHaveBeenCalledWith(2025)
    expect(mockGetMonthlyPnL).toHaveBeenCalledTimes(1)

    await w.setProps({ year: 2026 })
    await flushPromises()
    expect(mockGetMonthlyPnL).toHaveBeenCalledWith(2026)
    expect(mockGetMonthlyPnL).toHaveBeenCalledTimes(2)
  })

  it('pending_items 渲染為註腳條列，並附雜項收款／廠商付款入口', async () => {
    mockGetMonthlyPnL.mockResolvedValueOnce(makeFixture())
    const w = mount(MonthlyPnLPanel, {
      props: { year: 2026, focusMonth: 10 },
      global: globalConfig,
    })
    await flushPromises()

    const pending = w.find('[data-test="pnl-pending"]')
    expect(pending.exists()).toBe(true)
    // 不再使用 el-alert
    expect(w.find('.el-alert').exists()).toBe(false)
    const items = pending.findAll('li')
    expect(items.length).toBe(2)
    expect(items[0].text()).toContain('全校節慶人數')
    expect(items[1].text()).toContain('預繳收入')
    expect(pending.text()).toContain('還沒算進本表的項目')
    expect(pending.text()).toContain('雜項收款')
    expect(pending.text()).toContain('廠商付款')
  })

  it('結餘列負數顯示 cell-negative class（紅色）', async () => {
    mockGetMonthlyPnL.mockResolvedValueOnce(makeFixture())
    const w = mount(MonthlyPnLPanel, {
      props: { year: 2026, focusMonth: 10 },
      global: globalConfig,
    })
    await flushPromises()

    const netRow = w.find('tr.row-net')
    expect(netRow.exists()).toBe(true)
    // 結餘 monthly[1] = -55000 → 應有 cell-negative；total = -5000 也是 → 共 2
    const negCells = netRow.findAll('.cell-negative')
    expect(negCells.length).toBe(2)
    // monthly[0] = 50000 正數 → cell-positive（其他月與 total 均為 0/負）
    expect(netRow.findAll('.cell-positive').length).toBe(1)
    // 0 值不該套色
    const zeroSampleCells = netRow.findAll('.cell-num')
    // 第 3 個 cell (index 2) = monthly[2] = 0
    expect(zeroSampleCells[2].classes()).not.toContain('cell-positive')
    expect(zeroSampleCells[2].classes()).not.toContain('cell-negative')
  })

  it('切片資訊列加上 row-breakdown class（縮排 + 柔色，避免被誤判為重複計算）', async () => {
    mockGetMonthlyPnL.mockResolvedValueOnce(makeFixture())
    const w = mount(MonthlyPnLPanel, {
      props: { year: 2026, focusMonth: 10 },
      global: globalConfig,
    })
    await flushPromises()

    const breakdownRow = w.find('tr[data-row-key="income_registration"]')
    expect(breakdownRow.exists()).toBe(true)
    expect(breakdownRow.classes()).toContain('row-breakdown')
    // 切片列不應同時被當小計
    expect(breakdownRow.classes()).not.toContain('row-subtotal')
  })

  it('小計列加上 row-subtotal class（用於粗體 + 淺底）', async () => {
    mockGetMonthlyPnL.mockResolvedValueOnce(makeFixture())
    const w = mount(MonthlyPnLPanel, {
      props: { year: 2026, focusMonth: 10 },
      global: globalConfig,
    })
    await flushPromises()

    const subtotalRow = w.find('tr[data-row-key="income_subtotal"]')
    expect(subtotalRow.exists()).toBe(true)
    expect(subtotalRow.classes()).toContain('row-subtotal')
  })

  it('金額千分位格式：100000 → "100,000"，0 → "—"', async () => {
    mockGetMonthlyPnL.mockResolvedValueOnce(makeFixture())
    const w = mount(MonthlyPnLPanel, {
      props: { year: 2026, focusMonth: 10 },
      global: globalConfig,
    })
    await flushPromises()

    const cashRow = w.find('tr[data-row-key="income_cash"]')
    expect(cashRow.exists()).toBe(true)
    const cells = cashRow.findAll('td.cell-num')
    // monthly[0] = 100000 → "100,000"
    expect(cells[0].text()).toBe('100,000')
    // monthly[1] = 200000 → "200,000"
    expect(cells[1].text()).toBe('200,000')
    // monthly[2] = 0 → "—"
    expect(cells[2].text()).toBe('—')
    // 合計欄（最後一格）= 300000
    expect(cells[cells.length - 1].text()).toBe('300,000')
    // 11、12 月為未來月 → 金額格留白（不顯示「—」）
    expect(cells[10].text()).toBe('')
    expect(cells[11].text()).toBe('')
  })

  it('unit=class 後綴 "班"、unit=amount 0 顯示 "—"', async () => {
    mockGetMonthlyPnL.mockResolvedValueOnce(makeFixture())
    const w = mount(MonthlyPnLPanel, {
      props: { year: 2026, focusMonth: 10 },
      global: globalConfig,
    })
    await flushPromises()

    const classRow = w.find('tr[data-row-key="classroom_count"]')
    expect(classRow.exists()).toBe(true)
    const cells = classRow.findAll('td.cell-num')
    // monthly[0] = 8 → "8 班"（unit=class）
    expect(cells[0].text()).toContain('班')
    expect(cells[0].text()).toContain('8')
    // 統計指標在未來月（12 月）照常顯示
    expect(cells[11].text()).toBe('9 班')
    // total === null → "—"（無單位後綴）
    const lastCell = cells[cells.length - 1]
    expect(lastCell.text()).toBe('—')
  })

  it('標題與「現金收付實現制」badge 已移到頁首：panel 不重複顯示，舊名也不殘留', async () => {
    mockGetMonthlyPnL.mockResolvedValueOnce(makeFixture())
    const w = mount(MonthlyPnLPanel, {
      props: { year: 2026, focusMonth: 10 },
      global: globalConfig,
    })
    await flushPromises()

    expect(w.find('[data-test="pnl-title"]').exists()).toBe(false)
    expect(w.find('[data-test="pnl-cashbasis-badge"]').exists()).toBe(false)
    // 舊名不應殘留
    expect(w.text()).not.toContain('月度損益表')
  })

  it('匯出按鈕已移到頁首：panel 內不再有匯出與「跳到本月」', async () => {
    mockGetMonthlyPnL.mockResolvedValueOnce(makeFixture())
    const w = mount(MonthlyPnLPanel, {
      props: { year: 2026, focusMonth: 10 },
      global: globalConfig,
    })
    await flushPromises()

    expect(w.findAll('button').some(b => b.text().includes('匯出'))).toBe(false)
    expect(w.find('[data-test="jump-to-current"]').exists()).toBe(false)
  })

  it('API 失敗時顯示 errorMsg empty state，不 crash', async () => {
    mockGetMonthlyPnL.mockRejectedValueOnce(new Error('boom'))
    const w = mount(MonthlyPnLPanel, {
      props: { year: 2026, focusMonth: 10 },
      global: globalConfig,
    })
    await flushPromises()
    // 進入 error empty 分支（無 data）
    expect(w.find('.pnl-error').exists()).toBe(true)
  })
})
