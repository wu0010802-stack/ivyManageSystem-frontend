import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { toast, TOAST_DURATION } from '../toast'

const STATUS_ID = '__parent_toast_container__'
const ALERT_ID = '__parent_toast_alert_container__'
const FADE_OUT_MS = 300

function toasts(regionId: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`#${regionId} .parent-toast`))
}

function injectedCss(): string {
  return document.getElementById('__parent_toast_style__')?.textContent ?? ''
}

describe('parent toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('停留時間（長輩可讀性）', () => {
    it('success/info 至少 3 秒、warn/error 至少 6 秒', () => {
      expect(TOAST_DURATION.success).toBeGreaterThanOrEqual(3000)
      expect(TOAST_DURATION.info).toBeGreaterThanOrEqual(3000)
      expect(TOAST_DURATION.warn).toBeGreaterThanOrEqual(6000)
      expect(TOAST_DURATION.error).toBeGreaterThanOrEqual(6000)
    })

    it('success 在預設時間前仍在、之後淡出移除', () => {
      toast.success('已送出')
      vi.advanceTimersByTime(TOAST_DURATION.success - 1)
      expect(toasts(STATUS_ID)).toHaveLength(1)
      vi.advanceTimersByTime(1 + FADE_OUT_MS)
      expect(toasts(STATUS_ID)).toHaveLength(0)
    })

    it('error 6 秒前仍在（舊版 2.4 秒就消失）', () => {
      toast.error('送出失敗')
      vi.advanceTimersByTime(5900)
      expect(toasts(ALERT_ID)).toHaveLength(1)
      vi.advanceTimersByTime(100 + FADE_OUT_MS)
      expect(toasts(ALERT_ID)).toHaveLength(0)
    })

    it('呼叫端第二參數仍可覆寫停留時間', () => {
      toast.warn('網路不穩', 1000)
      vi.advanceTimersByTime(1000 + FADE_OUT_MS)
      expect(toasts(STATUS_ID)).toHaveLength(0)
    })
  })

  describe('a11y', () => {
    it('error 走 assertive alert region，其餘走 polite status region', () => {
      toast.error('錯誤')
      toast.success('成功')
      const alert = document.getElementById(ALERT_ID)!
      const status = document.getElementById(STATUS_ID)!
      expect(alert.getAttribute('role')).toBe('alert')
      expect(alert.getAttribute('aria-live')).toBe('assertive')
      expect(status.getAttribute('role')).toBe('status')
      expect(status.getAttribute('aria-live')).toBe('polite')
      expect(alert.textContent).toContain('錯誤')
      expect(status.textContent).toContain('成功')
    })

    it('不搶焦點、toast 本身不可聚焦，圖示對 SR 隱藏', () => {
      const btn = document.createElement('button')
      document.body.appendChild(btn)
      btn.focus()
      toast.error('送出失敗')
      expect(document.activeElement).toBe(btn)
      const el = toasts(ALERT_ID)[0]
      expect(el.querySelector('button, [tabindex]')).toBeNull()
      for (const icon of el.querySelectorAll('.material-symbols-rounded')) {
        expect(icon.getAttribute('aria-hidden')).toBe('true')
      }
    })
  })

  describe('可關閉', () => {
    it('error/warn 點擊即關閉', () => {
      toast.error('送出失敗')
      toast.warn('請稍後再試')
      toasts(ALERT_ID)[0].click()
      toasts(STATUS_ID)[0].click()
      vi.advanceTimersByTime(FADE_OUT_MS)
      expect(toasts(ALERT_ID)).toHaveLength(0)
      expect(toasts(STATUS_ID)).toHaveLength(0)
    })

    it('success/info 不可點擊關閉，也不攔截下方點擊', () => {
      toast.success('已儲存')
      const el = toasts(STATUS_ID)[0]
      expect(el.classList.contains('parent-toast--dismissible')).toBe(false)
      el.click()
      vi.advanceTimersByTime(FADE_OUT_MS)
      expect(toasts(STATUS_ID)).toHaveLength(1)
      expect(injectedCss()).toMatch(/\.parent-toast \{[^}]*pointer-events: none/)
      expect(injectedCss()).toMatch(/\.parent-toast--dismissible \{[^}]*pointer-events: auto/)
    })

    it('連續觸發時同一 region 最多保留 3 則', () => {
      for (let i = 0; i < 5; i++) toast.info(`訊息 ${i}`)
      vi.advanceTimersByTime(FADE_OUT_MS)
      const alive = toasts(STATUS_ID)
      expect(alive).toHaveLength(3)
      expect(alive.map((e) => e.textContent)).toEqual(
        expect.arrayContaining([expect.stringContaining('訊息 4')]),
      )
    })
  })

  describe('位置與配色', () => {
    it('固定在底部導覽列之上並吃 safe-area，不再貼頂', () => {
      toast.info('hi')
      const css = injectedCss()
      expect(css).toMatch(/bottom: calc\(80px \+ env\(safe-area-inset-bottom, 0px\) \+ 16px\)/)
      expect(css).not.toMatch(/top:\s*20px/)
    })

    it('統一 inverse-surface 底＋inverse-on-surface 字；語意色只在左邊條／圖示，且 dark 有覆寫', () => {
      toast.warn('注意')
      const css = injectedCss()
      expect(css).toMatch(/background: var\(--m3-inverse-surface/)
      expect(css).toMatch(/color: var\(--m3-inverse-on-surface/)
      // 舊版 warn 白字配 #f59e0b（2.15:1）不得復活
      expect(css).not.toContain('#f59e0b')
      for (const type of ['error', 'warn', 'info']) {
        expect(css).toContain(`[data-theme='dark'] .parent-toast--${type}`)
      }
      expect(toasts(STATUS_ID)[0].classList.contains('parent-toast--warn')).toBe(true)
    })

    it('文字 ≥4.5:1、語意邊條／圖示 ≥3:1（light/dark 各自對 inverse-surface 計算）', () => {
      toast.info('x')
      const css = injectedCss()
      const m3 = readFileSync(resolve(__dirname, '../../styles/m3-tokens.css'), 'utf-8')
      const darkAt = m3.indexOf(":root[data-theme='dark']")
      const token = (block: string, name: string): string =>
        block.match(new RegExp(`--m3-${name}:\\s*(#[0-9a-f]{6})`, 'i'))![1]
      const themes = {
        light: { block: m3.slice(0, darkAt), sel: (t: string) => `.parent-toast--${t} {` },
        dark: { block: m3.slice(darkAt), sel: (t: string) => `[data-theme='dark'] .parent-toast--${t} {` },
      }
      for (const [theme, { block, sel }] of Object.entries(themes)) {
        const bg = token(block, 'inverse-surface')
        expect(contrast(token(block, 'inverse-on-surface'), bg), `${theme} 文字`).toBeGreaterThanOrEqual(4.5)
        for (const type of ['error', 'warn', 'info']) {
          const rule = css.slice(css.indexOf(sel(type)))
          const accent = rule.match(/--parent-toast-accent:\s*(#[0-9a-f]{6})/i)![1]
          expect(contrast(accent, bg), `${theme} ${type} 邊條`).toBeGreaterThanOrEqual(3)
        }
        // success 借 inverse-primary（本來就是 inverse-surface 上的主色）
        expect(contrast(token(block, 'inverse-primary'), bg), `${theme} success 邊條`).toBeGreaterThanOrEqual(3)
      }
    })
  })
})

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
