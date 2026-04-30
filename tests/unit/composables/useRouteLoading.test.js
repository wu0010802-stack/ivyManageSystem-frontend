import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetFirstNavigationForTests,
  finishRouteLoading,
  resetRouteLoading,
  startRouteLoading,
  useRouteLoading,
} from '@/composables/useRouteLoading'

describe('useRouteLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetFirstNavigationForTests()
  })

  afterEach(() => {
    __resetFirstNavigationForTests()
    vi.useRealTimers()
  })

  describe('首次導航：冷啟動全頁 logo overlay', () => {
    it('延遲 120ms 顯示，避免快速切頁閃爍', () => {
      const { routeLoading, routeProgress } = useRouteLoading()

      startRouteLoading()
      expect(routeLoading.value).toBe(false)
      expect(routeProgress.value).toBe(false)

      vi.advanceTimersByTime(120)
      expect(routeLoading.value).toBe(true)
      expect(routeProgress.value).toBe(false)
    })

    it('導航完成後關閉 overlay 並翻轉 firstNavigationDone', () => {
      const { routeLoading, firstNavigationDone } = useRouteLoading()

      expect(firstNavigationDone.value).toBe(false)
      startRouteLoading()
      vi.advanceTimersByTime(120)
      finishRouteLoading()
      vi.advanceTimersByTime(400)

      expect(routeLoading.value).toBe(false)
      expect(firstNavigationDone.value).toBe(true)
    })

    it('overlay 顯示時間不足最短 400ms，延遲關閉', () => {
      const { routeLoading } = useRouteLoading()

      startRouteLoading()
      vi.advanceTimersByTime(120)
      expect(routeLoading.value).toBe(true)

      vi.advanceTimersByTime(100)
      finishRouteLoading()
      expect(routeLoading.value).toBe(true)

      vi.advanceTimersByTime(300)
      expect(routeLoading.value).toBe(false)
    })

    it('overlay 顯示超過最短時間後 finish，立刻關閉', () => {
      const { routeLoading } = useRouteLoading()

      startRouteLoading()
      vi.advanceTimersByTime(120)
      vi.advanceTimersByTime(500)
      finishRouteLoading()

      expect(routeLoading.value).toBe(false)
    })

    it('finish 在 delay window 內呼叫，整段不顯示', () => {
      const { routeLoading } = useRouteLoading()

      startRouteLoading()
      // 還沒到 120ms
      vi.advanceTimersByTime(50)
      finishRouteLoading()
      vi.advanceTimersByTime(500)

      expect(routeLoading.value).toBe(false)
    })
  })

  describe('日常導航：頂部細條（首次完成後）', () => {
    function completeFirstNavigation() {
      startRouteLoading()
      vi.advanceTimersByTime(120)
      finishRouteLoading()
      vi.advanceTimersByTime(400)
    }

    it('第二次起切換顯示細條而非全頁 overlay', () => {
      const { routeLoading, routeProgress, firstNavigationDone } = useRouteLoading()

      completeFirstNavigation()
      expect(firstNavigationDone.value).toBe(true)

      startRouteLoading()
      vi.advanceTimersByTime(80) // PROGRESS_DELAY_MS
      expect(routeLoading.value).toBe(false)
      expect(routeProgress.value).toBe(true)
    })

    it('細條 finish 後等到 PROGRESS_MIN_SHOW_MS 才關閉', () => {
      const { routeProgress } = useRouteLoading()

      completeFirstNavigation()

      startRouteLoading()
      vi.advanceTimersByTime(80)
      expect(routeProgress.value).toBe(true)

      vi.advanceTimersByTime(50) // 顯示才 50ms
      finishRouteLoading()
      expect(routeProgress.value).toBe(true) // 還沒滿 220ms

      vi.advanceTimersByTime(170) // 共 220ms
      expect(routeProgress.value).toBe(false)
    })

    it('快速切頁（finish 在 80ms delay 內）細條不顯示', () => {
      const { routeProgress } = useRouteLoading()

      completeFirstNavigation()

      startRouteLoading()
      vi.advanceTimersByTime(40) // 還沒到 80ms
      finishRouteLoading()
      vi.advanceTimersByTime(500)

      expect(routeProgress.value).toBe(false)
    })

    it('翻轉後再也不會回到全頁 overlay 模式', () => {
      const { routeLoading, firstNavigationDone } = useRouteLoading()

      completeFirstNavigation()
      expect(firstNavigationDone.value).toBe(true)

      startRouteLoading()
      vi.advanceTimersByTime(120) // 即使等到 LOADING_DELAY_MS 也不該顯示
      expect(routeLoading.value).toBe(false)

      finishRouteLoading()
      vi.advanceTimersByTime(500)
      expect(firstNavigationDone.value).toBe(true)
    })
  })

  describe('resetRouteLoading 強制清除', () => {
    it('立刻關閉所有狀態，不受最短顯示時間限制', () => {
      const { routeLoading } = useRouteLoading()

      startRouteLoading()
      vi.advanceTimersByTime(120)
      expect(routeLoading.value).toBe(true)

      vi.advanceTimersByTime(50)
      resetRouteLoading()

      expect(routeLoading.value).toBe(false)
    })

    it('清除細條進度條', () => {
      const { routeProgress } = useRouteLoading()

      // 先翻轉首次導航
      startRouteLoading()
      vi.advanceTimersByTime(120)
      finishRouteLoading()
      vi.advanceTimersByTime(400)

      startRouteLoading()
      vi.advanceTimersByTime(80)
      expect(routeProgress.value).toBe(true)

      resetRouteLoading()
      expect(routeProgress.value).toBe(false)
    })
  })
})
