/**
 * FeeRecordsTab UI/UX 重構回歸測試（2026-08-17）。
 *
 * - summary strip 移到 filters/table 之前；paid/partial/unpaid count 是 fee record 數，單位「筆」。
 * - 金額欄掛 class-name="num-cell"（全域 tabular-nums 右對齊）。
 * - toolbar 控制項具 aria-label；搜尋/狀態走 AdminListToolbar。
 * - 載入錯誤顯示持久 EmptyState error + 重試；空狀態區分「尚無」與「篩選無結果」。
 * - request race：舊 response 不得覆蓋新條件；reset 不得觸發多重 fetch。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

const getFeeRecords = vi.fn()
const getFeeSummary = vi.fn()
const payFeeRecord = vi.fn()
vi.mock('@/api/fees', () => ({
  getFeeRecords: (...args: unknown[]) => getFeeRecords(...args),
  getFeeSummary: (...args: unknown[]) => getFeeSummary(...args),
  payFeeRecord: (...args: unknown[]) => payFeeRecord(...args),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'

const SUMMARY = {
  total_count: 50,
  total_due: 100000,
  total_paid: 60000,
  paid_count: 20,
  partial_count: 5,
  unpaid_count: 25,
  total_unpaid: 40000,
}

const ROW = {
  id: 1,
  student_name: '測試生',
  classroom_name: '測試班',
  fee_item_name: '測試費項',
  period: '114-1',
  amount_due: 1000,
  amount_paid: 0,
  status: 'unpaid',
}

interface TabVm {
  fetchRecords: () => Promise<void>
  resetRecordFilters: () => Promise<void>
  recordFilter: { period: string; classroom_name: string; status: string; student_name: string }
  feeRecords: unknown[]
  loadError: boolean
}

const mountTab = (opts: { unstubToolbar?: boolean; unstubEmpty?: boolean } = {}) =>
  shallowMount(FeeRecordsTab, {
    props: { classrooms: [], periodOptions: ['114-1'] },
    global: {
      stubs: {
        teleport: true,
        'el-table-column': { template: '<span />' },
        ...(opts.unstubToolbar ? { AdminListToolbar: false } : {}),
        ...(opts.unstubEmpty ? { EmptyState: false } : {}),
      },
    },
  })

const vmOf = (w: ReturnType<typeof mountTab>) => w.vm as unknown as TabVm

beforeEach(() => {
  vi.clearAllMocks()
  getFeeRecords.mockResolvedValue({ items: [ROW], total: 1 })
  getFeeSummary.mockResolvedValue(SUMMARY)
})

describe('FeeRecordsTab summary strip', () => {
  it('summary 位於 table 之前，count 單位為「筆」不是「人」', async () => {
    const w = mountTab()
    await vmOf(w).fetchRecords()
    await flushPromises()

    const html = w.html()
    const summaryIdx = html.indexOf('data-test="fee-summary"')
    const tableIdx = html.indexOf('el-table')
    expect(summaryIdx).toBeGreaterThan(-1)
    expect(tableIdx).toBeGreaterThan(-1)
    expect(summaryIdx).toBeLessThan(tableIdx)

    const text = w.text()
    expect(text).toContain('已繳 20 筆')
    expect(text).toContain('部分繳費 5 筆')
    expect(text).toContain('未繳 25 筆')
    expect(text).not.toMatch(/\d+\s*人/)
  })

  it('待收金額為 summary 主要層級（main slot），總應收/已收為次要', async () => {
    const w = mountTab()
    await vmOf(w).fetchRecords()
    await flushPromises()
    const main = w.find('[data-test="fee-summary-main"]')
    expect(main.exists()).toBe(true)
    expect(main.text()).toContain('待收')
  })
})

describe('FeeRecordsTab 表格與 toolbar', () => {
  it('應繳/已繳金額欄掛 class-name="num-cell"', async () => {
    // el-table-column stub 為 <span />，class-name attr fallthrough 到 span 根節點
    const w = mountTab()
    await vmOf(w).fetchRecords()
    await flushPromises()
    expect(w.findAll('[class-name="num-cell"]').length).toBeGreaterThanOrEqual(2)
  })

  it('學期/班級 select 具 aria-label；搜尋輸入具 aria-label（AdminListToolbar）', async () => {
    const w = mountTab({ unstubToolbar: true })
    await flushPromises()
    const html = w.html()
    expect(html).toContain('aria-label="學期"')
    expect(html).toContain('aria-label="班級"')
    // AdminListToolbar 內的搜尋 el-input 需帶 aria-label（未 stub AdminListToolbar 本體）
    const searchInput = w.find('[data-test="toolbar-search"]')
    expect(searchInput.exists()).toBe(true)
    expect(searchInput.html()).toContain('aria-label')
  })

  it('不再有獨立「搜尋」按鈕（debounce + Enter 已覆蓋）', () => {
    const w = mountTab()
    const searchBtn = w
      .findAll('el-button')
      .find((b) => b.text().trim() === '搜尋')
    expect(searchBtn).toBeUndefined()
  })
})

describe('FeeRecordsTab 載入/空/錯誤狀態', () => {
  it('載入錯誤 → 持久 EmptyState error variant + 重試按鈕可重新 fetch', async () => {
    getFeeRecords.mockRejectedValueOnce(new Error('boom'))
    const w = mountTab({ unstubEmpty: true })
    await vmOf(w).fetchRecords()
    await flushPromises()

    const errorState = w.find('[data-test="fee-error-state"]')
    expect(errorState.exists()).toBe(true)

    // 重試恢復
    getFeeRecords.mockResolvedValue({ items: [ROW], total: 1 })
    await w.find('[data-test="fee-error-retry"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="fee-error-state"]').exists()).toBe(false)
    expect(vmOf(w).feeRecords.length).toBe(1)
  })

  it('空資料 + 有篩選 → 「目前篩選沒有結果」+ 清除篩選；無篩選 → 「尚無費用紀錄」', async () => {
    getFeeRecords.mockResolvedValue({ items: [], total: 0 })
    const w = mountTab({ unstubEmpty: true })
    const vm = vmOf(w)

    await vm.fetchRecords()
    await flushPromises()
    expect(w.text()).toContain('尚無費用紀錄')

    vm.recordFilter.status = 'unpaid'
    await flushPromises()
    await vm.fetchRecords()
    await flushPromises()
    expect(w.text()).toContain('目前篩選沒有結果')
    expect(w.find('[data-test="fee-empty-clear-filters"]').exists()).toBe(true)
  })

  it('表格容器帶 aria-busy 呼應 loading 狀態', async () => {
    let resolveFetch: (v: unknown) => void = () => {}
    getFeeRecords.mockImplementation(() => new Promise((r) => { resolveFetch = r }))
    const w = mountTab()
    const p = vmOf(w).fetchRecords()
    await flushPromises()
    expect(w.find('[aria-busy="true"]').exists()).toBe(true)
    resolveFetch({ items: [ROW], total: 1 })
    await p
    await flushPromises()
    expect(w.find('[aria-busy="true"]').exists()).toBe(false)
  })
})

describe('FeeRecordsTab race / reset / debounce', () => {
  it('舊 response 不得覆蓋新條件（request sequence 守衛）', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    getFeeRecords.mockImplementation(() => new Promise((r) => { resolvers.push(r) }))
    const w = mountTab()
    const vm = vmOf(w)

    const p1 = vm.fetchRecords() // 舊條件
    const p2 = vm.fetchRecords() // 新條件
    await flushPromises()
    expect(resolvers.length).toBe(2)

    // 新的先回、舊的後回 → 最終資料必須是新的
    resolvers[1]({ items: [{ ...ROW, id: 99, student_name: '新條件' }], total: 1 })
    await flushPromises()
    resolvers[0]({ items: [{ ...ROW, id: 1, student_name: '舊條件' }], total: 1 })
    await Promise.allSettled([p1, p2])
    await flushPromises()

    expect((vm.feeRecords[0] as { id: number }).id).toBe(99)
  })

  it('reset 只發出一輪查詢（不因多個 watcher 疊加重複 fetch）', async () => {
    vi.useFakeTimers()
    try {
      const w = mountTab()
      const vm = vmOf(w)
      vm.recordFilter.period = '114-1'
      vm.recordFilter.status = 'unpaid'
      vm.recordFilter.student_name = '小明'
      await flushPromises()
      await vi.runAllTimersAsync()
      getFeeRecords.mockClear()

      await vm.resetRecordFilters()
      await vi.runAllTimersAsync()
      await flushPromises()

      expect(getFeeRecords).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('學生姓名維持 300ms debounce', async () => {
    vi.useFakeTimers()
    try {
      const w = mountTab()
      const vm = vmOf(w)
      vm.recordFilter.student_name = '小'
      await vi.advanceTimersByTimeAsync(200)
      expect(getFeeRecords).not.toHaveBeenCalled()
      vm.recordFilter.student_name = '小明'
      await vi.advanceTimersByTimeAsync(299)
      expect(getFeeRecords).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(getFeeRecords).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
