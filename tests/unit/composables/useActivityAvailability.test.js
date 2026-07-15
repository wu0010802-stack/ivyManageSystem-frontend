import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── API mocks ──────────────────────────────────────────────────────────────
const getPublicCoursesAvailability = vi.fn()

vi.mock('@/api/activityPublic', () => ({
  getPublicCoursesAvailability: (...a) => getPublicCoursesAvailability(...a),
}))

// ────────────────────────────────────────────────────────────────── //

import { useActivityAvailability } from '@/composables/useActivityAvailability'

describe('useActivityAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPublicCoursesAvailability.mockResolvedValue({ data: { 美術: 5, 舞蹈: 0 } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refresh 成功後更新 availability', async () => {
    const mockData = { 美術: 5, 舞蹈: 0 }
    getPublicCoursesAvailability.mockResolvedValue({ data: mockData })

    const { availability, refresh } = useActivityAvailability()
    await refresh()

    expect(availability.value).toEqual(mockData)
  })

  it('setTerm 後 refresh 以該學期查 availability，並清掉前一學期資料', async () => {
    const { availability, refresh, setTerm } = useActivityAvailability()
    availability.value = { 本學期課程: 3 }

    setTerm({ school_year: 113, semester: 2 })
    expect(availability.value).toEqual({})
    await refresh()

    expect(getPublicCoursesAvailability).toHaveBeenCalledWith({
      school_year: 113,
      semester: 2,
    })
  })

  it('refresh 成功後更新 lastUpdate', async () => {
    const before = Date.now()
    const { lastUpdate, refresh } = useActivityAvailability()
    await refresh()
    const after = Date.now()

    expect(lastUpdate.value).toBeGreaterThanOrEqual(before)
    expect(lastUpdate.value).toBeLessThanOrEqual(after)
  })

  it('refresh API 失敗時靜默（不拋出異常）', async () => {
    getPublicCoursesAvailability.mockRejectedValue(new Error('API 失敗'))

    const { error, loading, ready, refresh } = useActivityAvailability()

    await expect(refresh()).resolves.toBeUndefined()
    expect(error.value).toBeInstanceOf(Error)
    expect(loading.value).toBe(false)
    expect(ready.value).toBe(false)
  })

  it('同學期 refresh 完成前 ready=false，成功後才標記該學期可用', async () => {
    let resolve
    getPublicCoursesAvailability.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const { loading, ready, requestedTermKey, loadedTermKey, setTerm, refresh } = useActivityAvailability()
    setTerm({ school_year: 113, semester: 2 })

    const pending = refresh()
    expect(loading.value).toBe(true)
    expect(ready.value).toBe(false)
    expect(requestedTermKey.value).toBe('113-2')
    expect(loadedTermKey.value).toBeNull()

    resolve({ data: { 歷史仍開放課: 5 } })
    await pending
    expect(loading.value).toBe(false)
    expect(ready.value).toBe(true)
    expect(loadedTermKey.value).toBe('113-2')
  })

  it('startPolling 設定計時器（呼叫 startPolling 後 advance 30000ms 確認 refresh 被呼叫）', async () => {
    vi.useFakeTimers()
    getPublicCoursesAvailability.mockResolvedValue({ data: {} })

    const { startPolling, stopPolling } = useActivityAvailability()
    startPolling(30000)

    await vi.advanceTimersByTimeAsync(30000)
    expect(getPublicCoursesAvailability).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30000)
    expect(getPublicCoursesAvailability).toHaveBeenCalledTimes(2)

    stopPolling()
  })

  it('stopPolling 清除計時器（advance 後確認 refresh 不再被呼叫）', async () => {
    vi.useFakeTimers()
    getPublicCoursesAvailability.mockResolvedValue({ data: {} })

    const { startPolling, stopPolling } = useActivityAvailability()
    startPolling(30000)
    stopPolling()

    await vi.advanceTimersByTimeAsync(60000)
    expect(getPublicCoursesAvailability).not.toHaveBeenCalled()
  })

  it('secondsSinceUpdate 在 refresh 後從 null 變為 0', async () => {
    const { secondsSinceUpdate, refresh } = useActivityAvailability()

    expect(secondsSinceUpdate.value).toBeNull()
    await refresh()
    expect(secondsSinceUpdate.value).toBe(0)
  })

  it('頁面隱藏時（visibilitychange hidden）清除輪詢計時器', async () => {
    vi.useFakeTimers()

    const { startPolling, stopPolling } = useActivityAvailability()
    startPolling(30000)

    // 模擬頁面隱藏
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    // 計時器應已清除，advance 後不再呼叫 API
    await vi.advanceTimersByTimeAsync(60000)
    expect(getPublicCoursesAvailability).not.toHaveBeenCalled()

    stopPolling()
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  })

  it('頁面重新顯示時（visibilitychange visible）重新建立輪詢', async () => {
    vi.useFakeTimers()

    const { startPolling, stopPolling } = useActivityAvailability()
    startPolling(30000)

    // 先隱藏（清除計時器）
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    // 再重新顯示
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    // 重新顯示後，advance 30000ms → 重新建立的 interval 觸發一次
    await vi.advanceTimersByTimeAsync(30000)
    // 至少有 1 次呼叫（重新顯示立即呼叫的 refresh 或 interval 觸發）
    expect(getPublicCoursesAvailability).toHaveBeenCalled()

    stopPolling()
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  })

  it('startPolling 預設 trackAge=false → 不建 tickTimer（secondsSinceUpdate 不隨秒更新）', async () => {
    vi.useFakeTimers()
    getPublicCoursesAvailability.mockResolvedValue({ data: {} })

    const { secondsSinceUpdate, startPolling, stopPolling } = useActivityAvailability()
    startPolling(30000) // 預設不追 age
    await vi.advanceTimersByTimeAsync(30000) // 觸發一次 refresh → lastUpdate 有值

    // 即使過了數秒，沒有 tickTimer → secondsSinceUpdate 維持 refresh 時設的 0
    await vi.advanceTimersByTimeAsync(5000)
    expect(secondsSinceUpdate.value).toBe(0)

    stopPolling()
  })

  it('startPolling({ trackAge: true }) → 建 tickTimer，secondsSinceUpdate 隨秒遞增', async () => {
    vi.useFakeTimers()
    getPublicCoursesAvailability.mockResolvedValue({ data: {} })

    const { secondsSinceUpdate, startPolling, stopPolling } = useActivityAvailability()
    startPolling(30000, { trackAge: true })
    await vi.advanceTimersByTimeAsync(30000) // refresh → lastUpdate=now, seconds=0

    await vi.advanceTimersByTimeAsync(3000)
    expect(secondsSinceUpdate.value).toBeGreaterThanOrEqual(3)

    stopPolling()
  })

  it('trackAge=true 時頁面隱藏一併清除 tickTimer', async () => {
    vi.useFakeTimers()
    getPublicCoursesAvailability.mockResolvedValue({ data: {} })

    const { secondsSinceUpdate, startPolling, stopPolling } = useActivityAvailability()
    startPolling(30000, { trackAge: true })
    await vi.advanceTimersByTimeAsync(30000)
    const snapshot = secondsSinceUpdate.value

    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    // hidden 後 tickTimer 已清，秒數不再前進
    await vi.advanceTimersByTimeAsync(5000)
    expect(secondsSinceUpdate.value).toBe(snapshot)

    stopPolling()
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  })

  it('stopPolling 同時移除 visibilitychange 監聽器', async () => {
    vi.useFakeTimers()

    const { startPolling, stopPolling } = useActivityAvailability()
    startPolling(30000)
    stopPolling()

    // stopPolling 後頁面重新顯示也不應觸發 refresh
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    await vi.advanceTimersByTimeAsync(30000)
    expect(getPublicCoursesAvailability).not.toHaveBeenCalled()
  })
})
