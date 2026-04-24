import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  finishRouteLoading,
  resetRouteLoading,
  startRouteLoading,
  useRouteLoading,
} from '@/composables/useRouteLoading'

describe('useRouteLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetRouteLoading()
  })

  afterEach(() => {
    resetRouteLoading()
    vi.useRealTimers()
  })

  it('延遲顯示跳轉載入狀態，避免快速切頁閃爍', () => {
    const { routeLoading } = useRouteLoading()

    startRouteLoading()

    expect(routeLoading.value).toBe(false)

    vi.advanceTimersByTime(120)

    expect(routeLoading.value).toBe(true)
  })

  it('導航完成後關閉載入狀態', () => {
    const { routeLoading } = useRouteLoading()

    startRouteLoading()
    vi.advanceTimersByTime(120)
    finishRouteLoading()
    vi.advanceTimersByTime(400)

    expect(routeLoading.value).toBe(false)
  })

  it('多段重導向時等待所有導航結束才關閉', () => {
    const { routeLoading } = useRouteLoading()

    startRouteLoading()
    startRouteLoading()
    vi.advanceTimersByTime(120)
    finishRouteLoading()

    expect(routeLoading.value).toBe(true)

    finishRouteLoading()
    vi.advanceTimersByTime(400)

    expect(routeLoading.value).toBe(false)
  })

  it('overlay 顯示後若 finish 太快，延遲關閉直到最短顯示時間', () => {
    const { routeLoading } = useRouteLoading()

    startRouteLoading()
    vi.advanceTimersByTime(120)
    expect(routeLoading.value).toBe(true)

    // 顯示後才 100ms 就 finish
    vi.advanceTimersByTime(100)
    finishRouteLoading()
    // 不應立刻關（總共才顯示 100ms，要滿 400ms）
    expect(routeLoading.value).toBe(true)

    // 再過 300ms，總顯示 400ms，應該關了
    vi.advanceTimersByTime(300)
    expect(routeLoading.value).toBe(false)
  })

  it('overlay 顯示超過最短時間後 finish，立刻關閉', () => {
    const { routeLoading } = useRouteLoading()

    startRouteLoading()
    vi.advanceTimersByTime(120)
    expect(routeLoading.value).toBe(true)

    // 顯示超過 400ms
    vi.advanceTimersByTime(500)
    finishRouteLoading()

    expect(routeLoading.value).toBe(false)
  })

  it('resetRouteLoading 立刻關閉，不受最短顯示時間限制', () => {
    const { routeLoading } = useRouteLoading()

    startRouteLoading()
    vi.advanceTimersByTime(120)
    expect(routeLoading.value).toBe(true)

    // 顯示才 50ms 就 reset（例如登出）
    vi.advanceTimersByTime(50)
    resetRouteLoading()

    expect(routeLoading.value).toBe(false)
  })
})
