import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope } from 'vue'

vi.mock('@/api/appraisal', () => ({
  getSignStatusSummary: vi.fn(),
  getAppraisalCycleExceptions: vi.fn(),
}))
vi.mock('@/api/yearEnd', () => ({
  getYearEndGrid: vi.fn(),
  getYearEndCycleExceptions: vi.fn(),
  previewAppraisalPayout: vi.fn(),
}))

import { getSignStatusSummary, getAppraisalCycleExceptions } from '@/api/appraisal'
import { getYearEndGrid, getYearEndCycleExceptions, previewAppraisalPayout } from '@/api/yearEnd'
import {
  useAppraisalWorkbenchStats,
  useYearEndWorkbenchStats,
  useExceptionsWorkbenchStats,
  usePayoutWorkbenchStats,
} from '../useWorkbenchStats'

// composable 內用 watch(..., {immediate:true})，須在 effectScope 內執行才會啟動
// 響應式追蹤並觸發首次 load（比照 Vue 官方建議的 composable 單元測試作法，
// 避免脫離元件情境時 watch 不生效）。
function runInScope<T>(fn: () => T): T {
  const scope = effectScope()
  return scope.run(fn) as T
}

describe('useAppraisalWorkbenchStats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cycle 為 null 時 stat 設為 0，不呼叫 API', async () => {
    const { stat, load } = runInScope(() => useAppraisalWorkbenchStats(() => null))
    await load()
    expect(stat.value).toBe(0)
    expect(getSignStatusSummary).not.toHaveBeenCalled()
  })

  it('成功時 stat = total - FINALIZED', async () => {
    vi.mocked(getSignStatusSummary).mockResolvedValue({
      data: { counts: { DRAFT: 2, SUPERVISOR_SIGNED: 1, FINALIZED: 3 } },
    } as never)
    const { stat, load } = runInScope(() => useAppraisalWorkbenchStats(() => ({ id: 5, label: 'x', status: 'OPEN' })))
    await load()
    expect(stat.value).toBe(3)
  })

  it('失敗時 stat 設為 0 且 errorMsg 非空', async () => {
    vi.mocked(getSignStatusSummary).mockRejectedValue(new Error('network'))
    const { stat, errorMsg, load } = runInScope(() => useAppraisalWorkbenchStats(() => ({ id: 5, label: 'x', status: 'OPEN' })))
    await load()
    expect(stat.value).toBe(0)
    expect(errorMsg.value).not.toBe('')
  })
})

describe('useYearEndWorkbenchStats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('成功時 stat = 非 FINALIZED 列數', async () => {
    vi.mocked(getYearEndGrid).mockResolvedValue({
      data: [{ status: 'DRAFT' }, { status: 'FINALIZED' }, { status: 'SUPERVISOR_SIGNED' }],
    } as never)
    const { stat, load } = runInScope(() => useYearEndWorkbenchStats(() => ({ id: 9, label: 'x', status: 'OPEN' })))
    await load()
    expect(stat.value).toBe(2)
  })
})

describe('useExceptionsWorkbenchStats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stat = blocking 筆數，appraisalCount/yearEndCount 分開計數', async () => {
    vi.mocked(getAppraisalCycleExceptions).mockResolvedValue({
      data: { items: [{ severity: 'blocking' }, { severity: 'warning' }] },
    } as never)
    vi.mocked(getYearEndCycleExceptions).mockResolvedValue({
      data: { items: [{ severity: 'blocking' }] },
    } as never)
    const { stat, appraisalCount, yearEndCount, load } = runInScope(() =>
      useExceptionsWorkbenchStats(
        () => ({ id: 1, label: 'x', status: 'OPEN' }),
        () => ({ id: 2, label: 'y', status: 'OPEN' }),
      ),
    )
    await load()
    expect(stat.value).toBe(2)
    expect(appraisalCount.value).toBe(2)
    expect(yearEndCount.value).toBe(1)
  })
})

describe('usePayoutWorkbenchStats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('year() 回傳 null 時 stat 設為 0，不呼叫 API', async () => {
    const { stat, load } = runInScope(() => usePayoutWorkbenchStats(() => null))
    await load()
    expect(stat.value).toBe(0)
    expect(previewAppraisalPayout).not.toHaveBeenCalled()
  })

  it('422 時 notReady=true，不視為 error', async () => {
    vi.mocked(previewAppraisalPayout).mockRejectedValue({ response: { status: 422 } })
    const { notReady, stat, load } = runInScope(() => usePayoutWorkbenchStats(() => 2026))
    await load()
    expect(notReady.value).toBe(true)
    expect(stat.value).toBe(0)
  })

  it('成功時 stat = 筆數，totalAmount 加總', async () => {
    vi.mocked(previewAppraisalPayout).mockResolvedValue({
      data: [{ total_amount: '1000' }, { total_amount: '2000' }],
    } as never)
    const { stat, totalAmount, load } = runInScope(() => usePayoutWorkbenchStats(() => 2026))
    await load()
    expect(stat.value).toBe(2)
    expect(totalAmount.value).toBe(3000)
  })
})
