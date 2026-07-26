/**
 * useActivityAvailability 輪詢防重入回歸測試（2026-07-26 才藝模組體檢）。
 *
 * 缺陷：`startPolling` 直接覆寫 timer handle，沒有先清掉既有的：
 *
 *     function startPolling(intervalMs = 30000, ...) {
 *       availabilityTimer = setInterval(refresh, intervalMs)   // ← 舊 handle 遺失
 *       ...
 *       document.addEventListener('visibilitychange', handleVisibilityChange)
 *       _visibilityCleanup = () => document.removeEventListener(...)  // ← 同樣被覆寫
 *     }
 *
 * 重複呼叫即洩漏一個 interval + 一個 visibilitychange listener，且 `stopPolling`
 * 只清得掉最後一次註冊的那組。同 repo 的 `usePortalDismissalAlerts.startPolling`
 * 是 `stopPolling(); pollingTimer = setInterval(...)`，本 composable 少了這道。
 *
 * 目前靠呼叫端 `usePublicRegistrationQuery` 的 `availabilityPollingStarted` 旗標擋住
 * （其註釋還特別寫「家長可能多次重查，prevent 疊加 interval」），所以尚未成為線上
 * 故障——但防護放在錯的層，新增呼叫端就會踩到。修正是把防重入收回 composable 自身。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useActivityAvailability } from '../useActivityAvailability'

vi.mock('@/api/activityPublic', () => ({
  getPublicCoursesAvailability: vi.fn(() => Promise.resolve({ data: {} })),
}))

describe('useActivityAvailability 輪詢生命週期', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('重複 startPolling 不疊加 interval', async () => {
    const setSpy = vi.spyOn(globalThis, 'setInterval')
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const { startPolling, stopPolling } = useActivityAvailability()

    startPolling(30000)
    startPolling(30000)
    startPolling(30000)

    // 第 2、3 次都必須先清掉前一個 timer，淨值恆為 1
    expect(setSpy.mock.calls.length - clearSpy.mock.calls.length).toBe(1)

    stopPolling()
    expect(setSpy.mock.calls.length - clearSpy.mock.calls.length).toBe(0)
  })

  it('stopPolling 後不再觸發 refresh', async () => {
    const { getPublicCoursesAvailability } = await import('@/api/activityPublic')
    const { startPolling, stopPolling } = useActivityAvailability()

    startPolling(1000)
    startPolling(1000)
    stopPolling()
    const callsAfterStop = vi.mocked(getPublicCoursesAvailability).mock.calls.length

    await vi.advanceTimersByTimeAsync(5000)

    expect(vi.mocked(getPublicCoursesAvailability).mock.calls.length).toBe(
      callsAfterStop,
    )
  })

  it('重複 startPolling 不洩漏 visibilitychange listener', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { startPolling, stopPolling } = useActivityAvailability()

    startPolling(30000)
    startPolling(30000)
    stopPolling()

    const added = addSpy.mock.calls.filter(([e]) => e === 'visibilitychange').length
    const removed = removeSpy.mock.calls.filter(
      ([e]) => e === 'visibilitychange',
    ).length
    expect(removed).toBe(added)
  })

  it('stopPolling 可安全重複呼叫（未啟動時亦然）', () => {
    const { stopPolling } = useActivityAvailability()

    expect(() => {
      stopPolling()
      stopPolling()
    }).not.toThrow()
  })
})
