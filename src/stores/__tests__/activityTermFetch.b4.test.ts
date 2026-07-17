import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * C4-activityStore-factory 行為保持測試。
 *
 * activity store 的 fetchSummary / fetchCharts / fetchAttendanceStats /
 * fetchDashboardTable 原為四份 copy-paste，抽出共用 term-fetch 引擎後行為必須
 * 完全等價。本檔以受控 deferred promise 驗證四個維度的等價語意：
 *   - term-key 快取命中（TTL 內同學期不重打；force 繞過）
 *   - in-flight 去重（同學期回同一 promise）
 *   - 切學期競態守衛（舊學期晚回不得覆寫新學期）
 *   - commit / error / loading 差異（summary 開始清 error、charts 不清；
 *     attendance 取 attendance_stats 子欄位）
 *
 * 先對「重構前」的實作跑綠 → 重構後仍綠 = 行為保持證明。
 */

vi.mock('@/api/activity', () => ({
  getActivityStats: vi.fn(),
  getActivityStatsCharts: vi.fn(),
  getActivityStatsSummary: vi.fn(),
  getActivityDashboardTable: vi.fn(),
}))

import {
  getActivityStats,
  getActivityStatsCharts,
  getActivityStatsSummary,
  getActivityDashboardTable,
} from '@/api/activity'
import { useActivityStore } from '../activity'

// vi.mock factory 產生的是無型別 mock；以 unknown 中轉避免 as any
const asMock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>

interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
}
function makeDeferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('activity store term-fetch 行為保持', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('summary：成功提交資料 + unreadInquiries + termKey + fetchedAt', async () => {
    asMock(getActivityStatsSummary).mockResolvedValue({ data: { unreadInquiries: 3 } })
    const store = useActivityStore()
    const r = await store.fetchSummary({ school_year: 113, semester: 1 })
    expect(store.summary).toEqual({ unreadInquiries: 3 })
    expect(store.unreadInquiries).toBe(3)
    expect(store.summaryTermKey).toBe('113-1')
    expect(store.lastSummaryFetchedAt).toBeGreaterThan(0)
    expect(store.loadingSummary).toBe(false)
    expect(r).toEqual({ unreadInquiries: 3 })
  })

  it('summary：TTL 內同學期命中快取不重打；force 繞過重打', async () => {
    asMock(getActivityStatsSummary).mockResolvedValue({ data: { unreadInquiries: 1 } })
    const store = useActivityStore()
    await store.fetchSummary({ school_year: 113, semester: 1 })
    expect(getActivityStatsSummary).toHaveBeenCalledTimes(1)

    // 同學期、TTL 內 → 命中快取，不重打
    await store.fetchSummary({ school_year: 113, semester: 1 })
    expect(getActivityStatsSummary).toHaveBeenCalledTimes(1)

    // force → 繞過快取重打
    await store.fetchSummary({ force: true, school_year: 113, semester: 1 })
    expect(getActivityStatsSummary).toHaveBeenCalledTimes(2)
  })

  it('charts：同學期 in-flight 去重回同一 promise（只打一次）', async () => {
    const d = makeDeferred<{ data: unknown }>()
    asMock(getActivityStatsCharts).mockReturnValue(d.promise)
    const store = useActivityStore()
    const p1 = store.fetchCharts({ school_year: 113, semester: 1 })
    const p2 = store.fetchCharts({ school_year: 113, semester: 1 })
    // 去重的可觀察行為 = 第二次呼叫不再打 API（async action 一律回新 wrapper
    // promise，故不以 p1===p2 判定）
    expect(getActivityStatsCharts).toHaveBeenCalledTimes(1)
    d.resolve({ data: { series: [1, 2] } })
    await Promise.all([p1, p2])
    expect(store.charts).toEqual({ series: [1, 2] })
    expect(store.loadingCharts).toBe(false)
  })

  it('summary：切學期競態 — 舊學期晚回不得覆寫新學期', async () => {
    const dOld = makeDeferred<{ data: unknown }>()
    const dNew = makeDeferred<{ data: unknown }>()
    asMock(getActivityStatsSummary)
      .mockReturnValueOnce(dOld.promise)
      .mockReturnValueOnce(dNew.promise)
    const store = useActivityStore()

    const pOld = store.fetchSummary({ school_year: 113, semester: 1 })
    const pNew = store.fetchSummary({ school_year: 113, semester: 2 })
    // 不同 termKey → 不去重，兩次獨立請求
    expect(getActivityStatsSummary).toHaveBeenCalledTimes(2)

    // 新學期先落地
    dNew.resolve({ data: { unreadInquiries: 9 } })
    await pNew
    expect(store.summary).toEqual({ unreadInquiries: 9 })
    expect(store.summaryTermKey).toBe('113-2')

    // 舊學期後落地 → 必須被丟棄（守衛：requestedTermKey / slot 已非本 entry）
    dOld.resolve({ data: { unreadInquiries: 1 } })
    await pOld
    expect(store.summary).toEqual({ unreadInquiries: 9 })
    expect(store.summaryTermKey).toBe('113-2')
  })

  it('summary：失敗設 error 為 err.message', async () => {
    const d = makeDeferred<{ data: unknown }>()
    asMock(getActivityStatsSummary).mockReturnValue(d.promise)
    const store = useActivityStore()
    const p = store.fetchSummary({ school_year: 113, semester: 1 })
    d.reject(new Error('boom'))
    await p
    expect(store.error).toBe('boom')
    expect(store.loadingSummary).toBe(false)
  })

  it('error 差異：summary 發送前清空 error；charts 發送前不清', async () => {
    const store = useActivityStore()

    // charts：發送前不清共享 error
    store.error = '舊錯誤'
    const dC = makeDeferred<{ data: unknown }>()
    asMock(getActivityStatsCharts).mockReturnValue(dC.promise)
    const pc = store.fetchCharts({ school_year: 113, semester: 1 })
    expect(store.error).toBe('舊錯誤')
    dC.resolve({ data: {} })
    await pc

    // summary：發送前清空 error
    store.error = '又一個舊錯誤'
    const dS = makeDeferred<{ data: unknown }>()
    asMock(getActivityStatsSummary).mockReturnValue(dS.promise)
    const ps = store.fetchSummary({ school_year: 113, semester: 1 })
    expect(store.error).toBe('')
    dS.resolve({ data: { unreadInquiries: 0 } })
    await ps
  })

  it('attendance：從 stats 回應取 attendance_stats 子欄位', async () => {
    asMock(getActivityStats).mockResolvedValue({
      data: { attendance_stats: { rate: 0.9 }, other: 'ignored' },
    })
    const store = useActivityStore()
    const r = await store.fetchAttendanceStats({ school_year: 113, semester: 1 })
    expect(store.attendance).toEqual({ rate: 0.9 })
    expect(r).toEqual({ rate: 0.9 })
    expect(store.attendanceTermKey).toBe('113-1')
  })

  it('attendance：回應無 attendance_stats 時為 null', async () => {
    asMock(getActivityStats).mockResolvedValue({ data: {} })
    const store = useActivityStore()
    await store.fetchAttendanceStats({ school_year: 113, semester: 1 })
    expect(store.attendance).toBeNull()
  })

  it('dashboardTable：成功提交並記錄 termKey / fetchedAt', async () => {
    asMock(getActivityDashboardTable).mockResolvedValue({ data: { rows: [1, 2, 3] } })
    const store = useActivityStore()
    const r = await store.fetchDashboardTable({ school_year: 113, semester: 2 })
    expect(store.dashboardTable).toEqual({ rows: [1, 2, 3] })
    expect(store.dashboardTableTermKey).toBe('113-2')
    expect(store.lastDashboardTableFetchedAt).toBeGreaterThan(0)
    expect(r).toEqual({ rows: [1, 2, 3] })
  })

  it('dashboardTable：切學期競態 — 舊學期晚回不得覆寫新學期', async () => {
    const dOld = makeDeferred<{ data: unknown }>()
    const dNew = makeDeferred<{ data: unknown }>()
    asMock(getActivityDashboardTable)
      .mockReturnValueOnce(dOld.promise)
      .mockReturnValueOnce(dNew.promise)
    const store = useActivityStore()

    const pOld = store.fetchDashboardTable({ school_year: 113, semester: 1 })
    const pNew = store.fetchDashboardTable({ school_year: 113, semester: 2 })

    dNew.resolve({ data: { rows: ['new'] } })
    await pNew
    expect(store.dashboardTable).toEqual({ rows: ['new'] })

    dOld.resolve({ data: { rows: ['old'] } })
    await pOld
    expect(store.dashboardTable).toEqual({ rows: ['new'] })
    expect(store.dashboardTableTermKey).toBe('113-2')
  })

  it('未指定學期時 termKey 為空字串，且不帶 school_year/semester 呼叫 API', async () => {
    asMock(getActivityStatsCharts).mockResolvedValue({ data: { ok: true } })
    const store = useActivityStore()
    await store.fetchCharts()
    expect(store.chartsTermKey).toBe('')
    expect(getActivityStatsCharts).toHaveBeenCalledWith({})
  })
})
