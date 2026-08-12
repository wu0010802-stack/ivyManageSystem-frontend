import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'

// vi.mock 工廠會被 hoist 到檔案最頂端，早於一般 top-level const 初始化執行；
// 直接在工廠內閉包參照下方 const 會撞 TDZ（"Cannot access before initialization"）。
// 用 vi.hoisted 讓資料本身也一併 hoist，避免此陷阱。
const { monthlyTrend } = vi.hoisted(() => ({
  monthlyTrend: Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    return m <= 6
      ? { month: m, revenue: 1000, refund: 10, expense: 500, net: 490 }
      : { month: m, revenue: 0, refund: 0, expense: 500000, net: -500000 }
  }),
}))

vi.mock('@/api/reports', () => ({
  getFinanceSummary: vi.fn().mockResolvedValue({
    data: {
      summary: { total_revenue: 6000, total_refund: 60, net_revenue: 5940, total_expense: 3003000, net_cashflow: -2997060 },
      monthly_trend: monthlyTrend,
      revenue_by_category: [
        { label: '學費', amount: 9000 },
        { label: '才藝', amount: 500 },
        { label: '雜項收款', amount: 500 },
      ],
      expense_by_category: [{ label: '員工應發', amount: 3000 }],
    },
  }),
  financeSummaryExportUrl: vi.fn().mockReturnValue('/reports/finance-summary/export?year=2026'),
}))

import FinanceSummaryPanel from '@/views/reports/FinanceSummaryPanel.vue'

// fake timers 用畢還原：無 afterEach 還原時，本檔收尾（auto-unmount、後續 hook）
// 仍在假時鐘下執行，EP 元件的 debounce/transition timer 掛著不走，是並行
// timeout flaky 的已知放大器（2026-08-11 測試架構稽核；比照 MonthlyFixedCostPanel）
afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  invalidateCachedAsync('reports/')
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 10)) // cutoff=7、lastActual=7、lastComplete=6
})

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(FinanceSummaryPanel, {
    props: { year: 2026, ...props },
    global: { plugins: [ElementPlus], stubs: { LineChart: true, FinanceDetailDialog: true } },
  })
}

describe('分類條列圖取代圓餅（spec §5）', () => {
  it('渲染 CategoryBarList 列（含學費占比），不再有 PieChart', async () => {
    const w = mountPanel()
    await flushPromises()
    const rows = w.findAll('[data-test="cat-row"]')
    expect(rows.length).toBeGreaterThanOrEqual(4) // 收入 3 + 支出 1
    expect(rows[0].text()).toContain('學費')
    expect(rows[0].text()).toContain('90.0%')
  })
})

describe('月度明細截列＋預登錄表尾（spec §5）', () => {
  it('只列到 lastActualMonth（7 列），無 8–12 月假紅字列', async () => {
    const w = mountPanel()
    await flushPromises()
    const table = w.findComponent({ name: 'ElTable' })
    expect((table.props('data') as unknown[]).length).toBe(7)
  })
  it('表尾顯示預登錄固定支出說明', async () => {
    const w = mountPanel()
    await flushPromises()
    const note = w.find('[data-test="prelogged-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('已預登錄固定支出')
  })
})

describe('initialMonth prop（總覽下鑽）', () => {
  it('initialMonth=3 時以單月模式載入', async () => {
    const w = mountPanel({ initialMonth: 3 })
    await flushPromises()
    expect(w.text()).toContain('檢視 2026 年 3 月')
  })
})
