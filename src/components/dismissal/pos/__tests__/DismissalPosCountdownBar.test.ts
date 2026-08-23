import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DismissalPosCountdownBar from '../DismissalPosCountdownBar.vue'

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

describe('DismissalPosCountdownBar', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe('一般模式（無 prefers-reduced-motion）', () => {
    it('全新掛載：起始 scaleX(1)（滿版），尚未加上 shrink transition', () => {
      vi.useFakeTimers()
      const w = mount(DismissalPosCountdownBar, {
        props: { startedAt: Date.now(), durationMs: 5000 },
      })
      const fill = w.find('.pos-countdown-bar__fill')
      expect((fill.element as HTMLElement).style.transform).toBe('scaleX(1)')
      expect((fill.element as HTMLElement).style.transitionDuration).toBe('0ms')
    })

    it('雙 rAF 後才觸發 shrink（scaleX(0)），transition-duration 對齊剩餘毫秒數', async () => {
      const startedAt = Date.now()
      const w = mount(DismissalPosCountdownBar, {
        props: { startedAt, durationMs: 5000 },
      })
      await nextFrame() // 第一層 rAF
      await nextFrame() // 第二層 rAF 才真的觸發（雙 rAF，比照 mockup 寫法）
      const fill = w.find('.pos-countdown-bar__fill')
      expect((fill.element as HTMLElement).style.transform).toBe('scaleX(0)')
      // 真實時鐘下 mount→計算 remaining 之間會過幾毫秒，容許極小誤差，不要求逐字 5000ms
      const ms = Number((fill.element as HTMLElement).style.transitionDuration.replace('ms', ''))
      expect(ms).toBeGreaterThan(4900)
      expect(ms).toBeLessThanOrEqual(5000)
    })

    it('途中掛載（startedAt 早於掛載時刻）：初始 scaleX 依剩餘比例接續，不會先跳回滿版', () => {
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)
      // durationMs=5000，已過 4000ms → 剩 1000ms → 初始比例應為 1000/5000 = 0.2
      const w = mount(DismissalPosCountdownBar, {
        props: { startedAt: now - 4000, durationMs: 5000 },
      })
      const fill = w.find('.pos-countdown-bar__fill')
      expect((fill.element as HTMLElement).style.transform).toBe('scaleX(0.2)')
    })

    it('途中掛載：transition-duration 對齊剩餘毫秒數（非重新跑滿 durationMs）', async () => {
      const now = Date.now()
      // 真實時鐘：用一個明顯早於現在的 startedAt，剩餘時間遠小於 durationMs
      const w = mount(DismissalPosCountdownBar, {
        props: { startedAt: now - 4000, durationMs: 5000 },
      })
      await nextFrame()
      await nextFrame()
      const fill = w.find('.pos-countdown-bar__fill')
      const ms = Number((fill.element as HTMLElement).style.transitionDuration.replace('ms', ''))
      expect(ms).toBeGreaterThan(0)
      expect(ms).toBeLessThanOrEqual(1000) // 剩餘 ~1000ms，不應等於完整 5000ms
    })

    it('startedAt 落在未來（時鐘誤差）：remaining 仍 clamp 在 durationMs 上界，不超過', () => {
      const now = Date.now()
      const w = mount(DismissalPosCountdownBar, {
        props: { startedAt: now + 10000, durationMs: 5000 }, // 未來時間 → elapsed 為負
      })
      const fill = w.find('.pos-countdown-bar__fill')
      // 尚未收縮前的初始 transform 應該是滿版（ratio clamp 在 1，不會 &gt;1）
      expect((fill.element as HTMLElement).style.transform).toBe('scaleX(1)')
    })

    it('卸載時清除雙層 rAF，callback 不會在卸載後才執行', async () => {
      const rafSpy = vi.spyOn(global, 'cancelAnimationFrame')
      const w = mount(DismissalPosCountdownBar, {
        props: { startedAt: Date.now(), durationMs: 5000 },
      })
      // 卸載發生在第一層 rAF 排程之後、真正觸發之前
      w.unmount()
      expect(rafSpy).toHaveBeenCalled()
    })
  })

  describe('prefers-reduced-motion', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    })

    it('掛載後立即標記 is-reduced，不套用 shrink transform', async () => {
      const w = mount(DismissalPosCountdownBar, {
        props: { startedAt: Date.now(), durationMs: 5000 },
      })
      await nextTick() // reducedMotion 於 onMounted 內設值，需等一輪 re-render 才反映到 class
      const fill = w.find('.pos-countdown-bar__fill')
      expect(fill.classes()).toContain('is-reduced')
      expect(fill.classes()).not.toContain('is-done')
      expect((fill.element as HTMLElement).style.transform).toBe('')
    })

    it('到期後仍會觸發完成（is-done），僅變色不做寬度動畫', async () => {
      vi.useFakeTimers()
      const startedAt = Date.now()
      const w = mount(DismissalPosCountdownBar, {
        props: { startedAt, durationMs: 5000 },
      })
      await nextTick()
      expect(w.find('.pos-countdown-bar__fill').classes()).not.toContain('is-done')

      vi.advanceTimersByTime(5000)
      await nextTick()
      expect(w.find('.pos-countdown-bar__fill').classes()).toContain('is-done')
    })

    it('途中掛載也能在正確的剩餘時間點觸發完成', async () => {
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)
      const w = mount(DismissalPosCountdownBar, {
        props: { startedAt: now - 4000, durationMs: 5000 }, // 剩 1000ms
      })
      await nextTick()

      vi.advanceTimersByTime(999)
      await nextTick()
      expect(w.find('.pos-countdown-bar__fill').classes()).not.toContain('is-done')

      vi.advanceTimersByTime(1)
      await nextTick()
      expect(w.find('.pos-countdown-bar__fill').classes()).toContain('is-done')
    })

    it('卸載時清除未到期的 timer（不留殭屍呼叫）', () => {
      vi.useFakeTimers()
      const clearSpy = vi.spyOn(global, 'clearTimeout')
      const w = mount(DismissalPosCountdownBar, {
        props: { startedAt: Date.now(), durationMs: 5000 },
      })
      w.unmount()
      expect(clearSpy).toHaveBeenCalled()
      // 卸載後即使時間推進也不該再有任何動作（沒有殘留計時器可推進，這裡只驗證不拋錯）
      expect(() => vi.advanceTimersByTime(10000)).not.toThrow()
    })
  })

  describe('邊界情況', () => {
    it('durationMs=0：視同已完成，transitionDuration 為 0ms、初始 scaleX(0)', () => {
      vi.useFakeTimers()
      const w = mount(DismissalPosCountdownBar, {
        props: { startedAt: Date.now(), durationMs: 0 },
      })
      const fill = w.find('.pos-countdown-bar__fill')
      expect((fill.element as HTMLElement).style.transform).toBe('scaleX(0)')
      expect((fill.element as HTMLElement).style.transitionDuration).toBe('0ms')
    })

    it('未帶 durationMs 時預設 5000ms', () => {
      vi.useFakeTimers()
      const w = mount(DismissalPosCountdownBar, {
        props: { startedAt: Date.now() },
      })
      const fill = w.find('.pos-countdown-bar__fill')
      expect((fill.element as HTMLElement).style.transform).toBe('scaleX(1)')
    })
  })
})
