/**
 * 帳款區（FeeRecordsTab）IA 改版行為（2026-08-25）：
 * - autoLoad 模式（帳單工作區）：掛載自載；預設聚焦 defaultPeriod ＋未繳
 * - summary 改用範圍參數（不含 status/page）：預設鎖未繳時統計仍涵蓋全狀態
 * - initialSearch（全域搜尋）：看該生全部帳款、debounce 單次查詢
 * - autoLoad=false（預設）維持既有「父層觸發」行為，不回歸既有測試
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
  total_count: 100,
  total_due: 500000,
  total_paid: 300000,
  paid_count: 60,
  partial_count: 5,
  unpaid_count: 35,
  total_unpaid: 200000,
}

interface TabVm {
  fetchRecords: () => Promise<void>
  resetRecordFilters: () => Promise<void>
  recordFilter: { period: string; classroom_name: string; status: string; student_name: string }
}

const mountTab = (
  props: Record<string, unknown> = {},
  opts: { unstubEmpty?: boolean } = {},
) =>
  shallowMount(FeeRecordsTab, {
    props: { classrooms: [], periodOptions: ['115-1', '114-2'], ...props },
    global: {
      stubs: {
        teleport: true,
        'el-table-column': { template: '<span />' },
        ...(opts.unstubEmpty ? { EmptyState: false } : {}),
      },
    },
  })

const vmOf = (w: ReturnType<typeof mountTab>) => w.vm as unknown as TabVm

beforeEach(() => {
  vi.clearAllMocks()
  getFeeRecords.mockResolvedValue({ items: [], total: 0 })
  getFeeSummary.mockResolvedValue(SUMMARY)
})

describe('FeeRecordsTab 預設範圍（autoLoad 模式）', () => {
  it('掛載即自載一次：聚焦 defaultPeriod ＋未繳；summary 不帶 status/page', async () => {
    mountTab({ autoLoad: true, defaultPeriod: '115-1' })
    await flushPromises()

    expect(getFeeRecords).toHaveBeenCalledTimes(1)
    expect(getFeeRecords).toHaveBeenCalledWith(
      expect.objectContaining({ period: '115-1', status: 'unpaid', page: 1 }),
    )
    expect(getFeeSummary).toHaveBeenCalledTimes(1)
    const summaryParams = getFeeSummary.mock.calls[0][0] as Record<string, unknown>
    expect(summaryParams.period).toBe('115-1')
    expect(summaryParams).not.toHaveProperty('status')
    expect(summaryParams).not.toHaveProperty('page')
  })

  it('autoLoad 未開（預設）不自載：既有父層觸發行為不變', async () => {
    mountTab()
    await flushPromises()
    expect(getFeeRecords).not.toHaveBeenCalled()
  })

  it('initialSearch（全域搜尋）：看該生全部帳款、由 debounce 觸發唯一一次查詢', async () => {
    vi.useFakeTimers()
    try {
      const w = mountTab({ autoLoad: true, defaultPeriod: '115-1', initialSearch: '王' })
      expect(vmOf(w).recordFilter.status).toBe('')
      expect(getFeeRecords).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(350)
      expect(getFeeRecords).toHaveBeenCalledTimes(1)
      expect(getFeeRecords).toHaveBeenCalledWith(
        expect.objectContaining({ student_name: '王' }),
      )
      const params = getFeeRecords.mock.calls[0][0] as Record<string, unknown>
      expect(params).not.toHaveProperty('status')
    } finally {
      vi.useRealTimers()
    }
  })

  it('清除篩選後回到全部（不帶 period/status），仍只發一輪查詢', async () => {
    const w = mountTab({ autoLoad: true, defaultPeriod: '115-1' })
    await flushPromises()
    getFeeRecords.mockClear()

    await vmOf(w).resetRecordFilters()
    await flushPromises()
    expect(getFeeRecords).toHaveBeenCalledTimes(1)
    const params = getFeeRecords.mock.calls[0][0] as Record<string, unknown>
    expect(params).not.toHaveProperty('status')
    expect(params).not.toHaveProperty('period')
  })

  it('預設鎖未繳時空清單顯示「目前篩選沒有結果」與清除篩選入口（說明下一步）', async () => {
    const w = mountTab({ autoLoad: true, defaultPeriod: '115-1' }, { unstubEmpty: true })
    await flushPromises()
    expect(w.text()).toContain('目前篩選沒有結果')
    expect(w.find('[data-test="fee-empty-clear-filters"]').exists()).toBe(true)
  })
})
