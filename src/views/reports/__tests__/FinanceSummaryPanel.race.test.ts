import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'

// A7 回歸測試（單月分支 request-sequence guard）：
// 單月模式 loadData 直接 await getFinanceSummary(year, month) 後寫 monthData，
// 缺 epoch 序號守衛時，快速切月（先 month=3 慢、後 month=5 快）會讓晚到的
// 3 月回應覆蓋掉已顯示的 5 月資料。加 epoch 後，晚到的舊回應應被丟棄。

vi.mock('@/api/reports', () => ({
  getFinanceSummary: vi.fn(),
  financeSummaryExportUrl: vi.fn().mockReturnValue('/reports/finance-summary/export?year=2026'),
}))

import { getFinanceSummary } from '@/api/reports'
import FinanceSummaryPanel from '@/views/reports/FinanceSummaryPanel.vue'

// 依 total_revenue 區分不同月份的 payload，供斷言辨識最終落地的是哪一月。
function monthPayload(totalRevenue: number) {
  return {
    summary: {
      total_revenue: totalRevenue,
      total_refund: 0,
      net_revenue: totalRevenue,
      total_expense: 0,
      net_cashflow: totalRevenue,
    },
    monthly_trend: [{ month: 3, revenue: totalRevenue, refund: 0, expense: 0, net: totalRevenue }],
    revenue_by_category: [],
    expense_by_category: [],
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

// fake timers 用畢還原：無 afterEach 還原時，本檔收尾（auto-unmount、後續 hook）
// 仍在假時鐘下執行，EP 元件的 debounce/transition timer 掛著不走，是並行
// timeout flaky 的已知放大器（2026-08-11 測試架構稽核；比照 MonthlyFixedCostPanel）
afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  invalidateCachedAsync('reports/')
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 10))
})

function mountPanel() {
  // 掛載時 immediate watch 以整年模式（selectedMonth=null）跑一次 year-level 載入，
  // 消耗這個預設 resolve；之後才用 once-mocks 佈置兩次單月請求的競態。
  vi.mocked(getFinanceSummary).mockResolvedValue({ data: monthPayload(0) } as never)
  return mount(FinanceSummaryPanel, {
    props: { year: 2026 },
    global: { plugins: [ElementPlus], stubs: { LineChart: true, FinanceDetailDialog: true } },
  })
}

describe('FinanceSummaryPanel 單月分支請求競態（A7）', () => {
  it('先發 month=3（慢）、再發 month=5（快），最終月資料為 5 月、不被 3 月覆蓋', async () => {
    const w = mountPanel()
    await flushPromises() // 整年模式初載完成

    const slow = deferred<{ data: ReturnType<typeof monthPayload> }>()
    vi.mocked(getFinanceSummary)
      .mockReturnValueOnce(slow.promise as never) // month=3：慢
      .mockResolvedValueOnce({ data: monthPayload(5000) } as never) // month=5：快

    const vm = w.vm as unknown as {
      onMonthChange: (val: number | undefined) => void
      monthData: { summary: { total_revenue: number } } | null
    }

    // 切到 3 月 → loadData(3) 觸發，卡在 await（slow 未 resolve）
    vm.onMonthChange(3)
    await nextTick()
    await flushPromises()

    // 切到 5 月 → loadData(5) 觸發並立即 resolve → 5 月落地
    vm.onMonthChange(5)
    await nextTick()
    await flushPromises()

    expect(vm.monthData?.summary.total_revenue).toBe(5000)
    expect(w.find('[data-test="kpi-total-revenue"]').text()).toContain('5,000')

    // 3 月的慢回應晚到：有 epoch 守衛時應被丟棄，不覆蓋 5 月
    slow.resolve({ data: monthPayload(3000) })
    await flushPromises()

    expect(vm.monthData?.summary.total_revenue).toBe(5000)
    expect(w.find('[data-test="kpi-total-revenue"]').text()).toContain('5,000')
    expect(w.find('[data-test="kpi-total-revenue"]').text()).not.toContain('3,000')
  })
})
