import { describe, it, expect, vi, beforeEach } from 'vitest'

const notify = vi.fn()

vi.mock('@/api/dataQuality', () => ({
  listReports: vi.fn(),
  getSummary: vi.fn(),
  ackReport: vi.fn(),
  resolveReport: vi.fn(),
  ignoreReport: vi.fn(),
  runNow: vi.fn(),
}))

vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify }),
}))

import {
  ackReport,
  getSummary,
  listReports,
  resolveReport,
  runNow,
} from '@/api/dataQuality'
import { useDataQualityReports } from '../useDataQualityReports'

type Mock = ReturnType<typeof vi.fn>

const okList = (items: unknown[] = [], total = 0) => ({
  data: { items, total, page: 1, page_size: 20 },
})
const okSummary = (overrides = {}) => ({
  data: {
    open_by_severity: { P0: 2, P1: 1, P2: 0 },
    total_open: 3,
    last_run_at: '2026-07-25',
    ...overrides,
  },
})

describe('useDataQualityReports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(listReports as Mock).mockResolvedValue(okList())
    ;(getSummary as Mock).mockResolvedValue(okSummary())
  })

  it('init 同時載入列表與統計', async () => {
    const dq = useDataQualityReports()
    await dq.init()

    expect(listReports).toHaveBeenCalledTimes(1)
    expect(getSummary).toHaveBeenCalledTimes(1)
    expect(dq.summary.value?.total_open).toBe(3)
  })

  it('統計不受列表篩選影響——只送出列表請求', async () => {
    const dq = useDataQualityReports()
    await dq.init()
    vi.clearAllMocks()

    dq.filters.severity = 'P0'
    await dq.applyFilters()

    expect(listReports).toHaveBeenCalledTimes(1)
    expect(getSummary).not.toHaveBeenCalled()
  })

  it('套用篩選時重置回第 1 頁', async () => {
    const dq = useDataQualityReports()
    await dq.changePage(3)
    expect(dq.filters.page).toBe(3)

    dq.filters.status = 'fixed'
    await dq.applyFilters()

    expect(dq.filters.page).toBe(1)
    expect((listReports as Mock).mock.lastCall?.[0]).toMatchObject({
      page: 1,
      status: 'fixed',
    })
  })

  it('變更每頁筆數同樣回到第 1 頁', async () => {
    const dq = useDataQualityReports()
    await dq.changePage(4)
    await dq.changePageSize(50)

    expect(dq.filters.page).toBe(1)
    expect(dq.filters.page_size).toBe(50)
  })

  it('空字串篩選不送出該查詢參數', async () => {
    const dq = useDataQualityReports()
    dq.filters.severity = ''
    dq.filters.rule_code = ''
    await dq.reload()

    const params = (listReports as Mock).mock.lastCall?.[0]
    expect(params).not.toHaveProperty('severity')
    expect(params).not.toHaveProperty('rule_code')
  })

  it('列表載入失敗時設 loadError 並保留既有資料', async () => {
    const dq = useDataQualityReports()
    ;(listReports as Mock).mockResolvedValueOnce(okList([{ id: 1 }], 1))
    await dq.reload()
    expect(dq.rows.value).toHaveLength(1)

    ;(listReports as Mock).mockRejectedValueOnce(new Error('boom'))
    await dq.reload()

    expect(dq.loadError.value).toBe(true)
    expect(dq.rows.value).toHaveLength(1) // 不清空，使用者還看得到上次結果
    expect(notify).toHaveBeenCalled()
  })

  it('統計載入失敗降級為 null 但不影響列表', async () => {
    const dq = useDataQualityReports()
    ;(getSummary as Mock).mockRejectedValueOnce(new Error('boom'))
    await dq.init()

    expect(dq.summary.value).toBeNull()
    expect(dq.loadError.value).toBe(false)
    expect(listReports).toHaveBeenCalled()
  })

  it('寫入成功後同時重載列表與統計', async () => {
    const dq = useDataQualityReports()
    ;(ackReport as Mock).mockResolvedValue({ data: { ok: true } })
    vi.clearAllMocks()
    ;(listReports as Mock).mockResolvedValue(okList())
    ;(getSummary as Mock).mockResolvedValue(okSummary())

    const ok = await dq.acknowledge(7, '已知悉')

    expect(ok).toBe(true)
    expect(ackReport).toHaveBeenCalledWith(7, { note: '已知悉' })
    expect(listReports).toHaveBeenCalledTimes(1)
    expect(getSummary).toHaveBeenCalledTimes(1)
  })

  it('寫入失敗回傳 false 且不重載——避免用一次成功的重載掩蓋失敗', async () => {
    const dq = useDataQualityReports()
    ;(resolveReport as Mock).mockRejectedValue(new Error('cannot resolve'))
    vi.clearAllMocks()

    const ok = await dq.resolve(9, '修好了')

    expect(ok).toBe(false)
    expect(notify).toHaveBeenCalled()
    expect(listReports).not.toHaveBeenCalled()
    expect(getSummary).not.toHaveBeenCalled()
  })

  it('立即檢查成功回傳結果摘要並重載', async () => {
    const dq = useDataQualityReports()
    ;(runNow as Mock).mockResolvedValue({
      data: { detected: 5, new_open: 2, ran_at: '2026-07-26T03:00:00+08:00' },
    })

    const result = await dq.triggerRunNow()

    expect(result?.detected).toBe(5)
    expect(dq.running.value).toBe(false)
    expect(getSummary).toHaveBeenCalled()
  })

  it('立即檢查失敗回傳 null 且解除 loading 狀態', async () => {
    const dq = useDataQualityReports()
    ;(runNow as Mock).mockRejectedValue(new Error('boom'))

    const result = await dq.triggerRunNow()

    expect(result).toBeNull()
    expect(dq.running.value).toBe(false)
    expect(notify).toHaveBeenCalled()
  })
})
