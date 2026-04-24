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

    expect(routeLoading.value).toBe(false)
  })
})
