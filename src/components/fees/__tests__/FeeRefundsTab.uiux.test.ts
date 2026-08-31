/**
 * FeeRefundsTab（Phase 2，2026-08-17）：改接後端 GET /fees/refunds 伺服器分頁。
 *
 * - 掛載即以 page/page_size 呼叫新端點，不再前端掃 100 筆 records 逐筆 fan-out。
 * - period／student_name 篩選帶給後端且 page 歸 1；student_name 維持 300ms debounce。
 * - 分頁換頁重抓；total 來自後端。
 * - 每個畫面狀態只留一個「新增退費」primary CTA。
 * - 載入失敗顯示持久 EmptyState error + 重試（不可只剩 toast）。
 * - 舊「僅掃描前 100 筆」提示已無必要，不得再出現。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

const getRefundedFeeRecords = vi.fn()
const getFeeRecords = vi.fn()
const getFeeRefunds = vi.fn()
const getFeePeriods = vi.fn()
vi.mock('@/api/fees', () => ({
  getRefundedFeeRecords: (...args: unknown[]) => getRefundedFeeRecords(...args),
  getFeeRecords: (...args: unknown[]) => getFeeRecords(...args),
  getFeeRefunds: (...args: unknown[]) => getFeeRefunds(...args),
  getFeePeriods: (...args: unknown[]) => getFeePeriods(...args),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  }
})

import FeeRefundsTab from '@/components/fees/FeeRefundsTab.vue'

const ITEM_A = {
  record_id: 1,
  student_id: 10,
  student_name: '測試生A',
  classroom_name: '測試班',
  period: '114-1',
  fee_item_name: '測試費項',
  fee_type: 'monthly',
  amount_due: 1000,
  amount_paid: 800,
  total_refunded: 300,
  refund_count: 2,
  latest_refund_at: '2026-08-03T09:00:00',
  refunds: [
    { id: 2, amount: 200, reason: '家長申請退費', notes: '', refunded_by: 'op', refunded_at: '2026-08-03T09:00:00' },
    { id: 1, amount: 100, reason: '家長申請退費', notes: '', refunded_by: 'op', refunded_at: '2026-08-01T10:00:00' },
  ],
}

const LIST_RESP = { total: 2, page: 1, page_size: 20, items: [ITEM_A] }

interface TabVm {
  loadRefundedRecords: () => Promise<void>
  filter: { period: string; student_name: string }
  refundedRows: unknown[]
  page: number
  pageSize: number
  total: number
  onPageChange: (p: number) => void
  loadError: boolean
}

const mountTab = () =>
  shallowMount(FeeRefundsTab, {
    props: { periodOptions: ['114-1'] },
    global: {
      stubs: {
        teleport: true,
        'el-table-column': { template: '<span />' },
        EmptyState: false,
        RefundSuggestModal: true,
      },
    },
  })

const vmOf = (w: ReturnType<typeof mountTab>) => w.vm as unknown as TabVm

beforeEach(() => {
  vi.clearAllMocks()
  getFeePeriods.mockResolvedValue(['114-1'])
  getRefundedFeeRecords.mockResolvedValue(LIST_RESP)
  getFeeRecords.mockResolvedValue({ items: [], total: 0 })
})

describe('FeeRefundsTab 伺服器分頁', () => {
  it('掛載即呼叫 GET /fees/refunds（page/page_size），渲染彙總列，不再逐筆 getFeeRefunds', async () => {
    const w = mountTab()
    await flushPromises()

    expect(getRefundedFeeRecords).toHaveBeenCalledTimes(1)
    const params = getRefundedFeeRecords.mock.calls[0][0] as Record<string, unknown>
    expect(params.page).toBe(1)
    expect(params.page_size).toBeGreaterThan(0)
    expect(getFeeRefunds).not.toHaveBeenCalled()

    expect(vmOf(w).refundedRows.length).toBe(1)
    expect(vmOf(w).total).toBe(2)
    // el-table 未註冊時 prop-driven 欄位不渲染 → 斷言映射後的 row 形狀（含 modal 需要的欄位）
    const row = vmOf(w).refundedRows[0] as Record<string, unknown>
    expect(row.id).toBe(1) // record_id 映射為 id（row-key 與再次退費沿用）
    expect(row.student_name).toBe('測試生A')
    expect(row.period).toBe('114-1')
    expect(row._total_refunded).toBe(300)
    expect((row._refunds as unknown[]).length).toBe(2)
  })

  it('period 篩選帶給後端且 page 歸 1', async () => {
    const w = mountTab()
    await flushPromises()
    const vm = vmOf(w)
    vm.page = 2
    getRefundedFeeRecords.mockClear()

    vm.filter.period = '114-1'
    await flushPromises()

    expect(getRefundedFeeRecords).toHaveBeenCalledTimes(1)
    const params = getRefundedFeeRecords.mock.calls[0][0] as Record<string, unknown>
    expect(params.period).toBe('114-1')
    expect(params.page).toBe(1)
  })

  it('student_name 維持 300ms debounce', async () => {
    vi.useFakeTimers()
    try {
      const w = mountTab()
      await vi.runOnlyPendingTimersAsync()
      getRefundedFeeRecords.mockClear()

      vmOf(w).filter.student_name = '小明'
      await vi.advanceTimersByTimeAsync(299)
      expect(getRefundedFeeRecords).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(getRefundedFeeRecords).toHaveBeenCalledTimes(1)
      const params = getRefundedFeeRecords.mock.calls[0][0] as Record<string, unknown>
      expect(params.student_name).toBe('小明')
    } finally {
      vi.useRealTimers()
    }
  })

  it('換頁重抓（帶新 page）', async () => {
    const w = mountTab()
    await flushPromises()
    getRefundedFeeRecords.mockClear()

    vmOf(w).onPageChange(2)
    await flushPromises()

    const params = getRefundedFeeRecords.mock.calls[0][0] as Record<string, unknown>
    expect(params.page).toBe(2)
  })

  it('不再顯示「僅掃描前 100 筆」限制提示', async () => {
    const w = mountTab()
    await flushPromises()
    expect(w.find('[data-test="refund-scan-notice"]').exists()).toBe(false)
    expect(w.text()).not.toContain('100 筆')
  })
})

describe('FeeRefundsTab 空/錯誤狀態', () => {
  it('無退費紀錄時整個畫面只有一顆 primary「新增退費」（toolbar）', async () => {
    getRefundedFeeRecords.mockResolvedValue({ total: 0, page: 1, page_size: 20, items: [] })
    const w = mountTab()
    await flushPromises()

    const primaryCtas = w
      .findAll('el-button')
      .filter((b) => b.text().includes('新增退費') && b.attributes('type') === 'primary')
    expect(primaryCtas.length).toBe(1)
    expect(w.text()).toContain('沒有退費紀錄')
  })

  it('載入失敗 → 持久 EmptyState error + 重試可恢復', async () => {
    getRefundedFeeRecords.mockRejectedValueOnce(new Error('boom'))
    const w = mountTab()
    await flushPromises()

    expect(w.find('[data-test="refund-error-state"]').exists()).toBe(true)

    getRefundedFeeRecords.mockResolvedValue(LIST_RESP)
    await w.find('[data-test="refund-error-retry"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="refund-error-state"]').exists()).toBe(false)
    expect(vmOf(w).refundedRows.length).toBe(1)
  })
})
