import { describe, it, expect } from 'vitest'
import {
  parseTaipeiDate, formatTaipeiClock, taipeiHour, formatTaipeiDay, taipeiDayKey,
} from '../taipeiTime'

/**
 * taipeiTime 是接送通知（admin 歷史表格 / portal / 家長時間軸）共用的
 * 「台北牆鐘」時間工具。後端 requested_at / completed_at 等是 naive ISO（無
 * 時區 offset，代表台北牆鐘）。直接 new Date() 會以裝置時區解析並顯示，
 * 非台灣裝置會差 8 小時。以下斷言全程顯式錨定 / 格式化於 Asia/Taipei，
 * 因此不論執行機器時區為何都成立（裝置時區無關）。
 */
describe('taipeiTime', () => {
  describe('parseTaipeiDate — 台北時區錨定', () => {
    it('無 offset 的 naive 字串錨定為 +08:00', () => {
      const naive = parseTaipeiDate('2026-06-04T16:00:00')
      const explicit = new Date('2026-06-04T16:00:00+08:00')
      expect(naive?.getTime()).toBe(explicit.getTime())
    })
    it('已帶 Z 的字串原樣解析', () => {
      const z = parseTaipeiDate('2026-06-04T08:00:00Z')
      expect(z?.getTime()).toBe(new Date('2026-06-04T08:00:00Z').getTime())
    })
    it('空值 / 不合法回 null', () => {
      expect(parseTaipeiDate(null)).toBeNull()
      expect(parseTaipeiDate(undefined)).toBeNull()
      expect(parseTaipeiDate('')).toBeNull()
      expect(parseTaipeiDate('not-a-date')).toBeNull()
    })
  })

  describe('formatTaipeiClock — HH:mm（台北牆鐘，裝置時區無關）', () => {
    it('naive 字串以台北牆鐘顯示（不被裝置時區位移）', () => {
      expect(formatTaipeiClock('2026-06-04T16:30:00')).toBe('16:30')
      expect(formatTaipeiClock('2026-06-04T07:05:00')).toBe('07:05')
    })
    it('帶 Z 的 UTC 字串換算成台北時間（+8）', () => {
      // 08:00 UTC = 16:00 台北
      expect(formatTaipeiClock('2026-06-04T08:00:00Z')).toBe('16:00')
    })
    it('午夜顯示 00:00（不出現 24:00）', () => {
      expect(formatTaipeiClock('2026-06-04T00:00:00')).toBe('00:00')
    })
    it('空值 / 不合法回 null', () => {
      expect(formatTaipeiClock(null)).toBeNull()
      expect(formatTaipeiClock('not-a-date')).toBeNull()
    })
  })

  describe('taipeiHour — 台北時區小時（時段桶分配用，裝置時區無關）', () => {
    it('naive 字串取台北小時', () => {
      expect(taipeiHour('2026-06-04T16:30:00')).toBe(16)
      expect(taipeiHour('2026-06-04T07:05:00')).toBe(7)
    })
    it('帶 Z 的 UTC 字串換算成台北小時', () => {
      // 08:00 UTC = 16 點台北
      expect(taipeiHour('2026-06-04T08:00:00Z')).toBe(16)
    })
    it('午夜回 0（非 24）', () => {
      expect(taipeiHour('2026-06-04T00:10:00')).toBe(0)
    })
    it('空值 / 不合法回 null', () => {
      expect(taipeiHour(null)).toBeNull()
      expect(taipeiHour('not-a-date')).toBeNull()
    })
  })
  /**
   * 娃娃車班次頁的日期列與「跨日殘留班次」偵測用（司機看不到日期時，最實質的
   * 風險就是在昨天忘了結束的班次上按離站）。星期不走 `Intl` 的 locale 字串
   * ——測試機與使用者裝置的預設 locale 不一定是 zh-TW，拿 `weekday: 'short'`
   * 會在不同環境回 `Wed` / `週三` / `三`。改以台北曆日自算，環境無關。
   */
  describe('formatTaipeiDay — M/D（週） 顯示', () => {
    it('naive 字串以台北曆日顯示，星期為中文單字', () => {
      // 2026-09-03 是星期四
      expect(formatTaipeiDay('2026-09-03T09:20:00')).toBe('9/3（四）')
      expect(formatTaipeiDay('2026-01-05T07:30:00')).toBe('1/5（一）')
    })
    it('跨日的 UTC 字串換算後才決定是哪一天', () => {
      // 2026-09-02T17:00Z = 2026-09-03 01:00 台北 → 已是 9/3
      expect(formatTaipeiDay('2026-09-02T17:00:00Z')).toBe('9/3（四）')
    })
    it('接受 Date（供取「今天」用，呼叫端不必繞 toISOString）', () => {
      // 2026-09-02T16:30Z = 2026-09-03 00:30 台北
      expect(formatTaipeiDay(new Date('2026-09-02T16:30:00Z'))).toBe('9/3（四）')
    })
    it('空值 / 不合法回 null', () => {
      expect(formatTaipeiDay(null)).toBeNull()
      expect(formatTaipeiDay('not-a-date')).toBeNull()
      expect(formatTaipeiDay(new Date('nope'))).toBeNull()
    })
  })

  describe('taipeiDayKey — YYYY-MM-DD 曆日鍵（比對是否同一天）', () => {
    it('naive 字串取台北曆日', () => {
      expect(taipeiDayKey('2026-09-03T00:10:00')).toBe('2026-09-03')
      expect(taipeiDayKey('2026-09-03T23:50:00')).toBe('2026-09-03')
    })
    it('月 / 日補零', () => {
      expect(taipeiDayKey('2026-01-05T09:00:00')).toBe('2026-01-05')
    })
    it('接受 Date（供取「今天」用）', () => {
      // 2026-09-02T16:30Z = 2026-09-03 00:30 台北
      expect(taipeiDayKey(new Date('2026-09-02T16:30:00Z'))).toBe('2026-09-03')
    })
    it('UTC 日界與台北日界不同：以台北為準', () => {
      // 2026-09-03T15:59Z = 2026-09-03 23:59 台北（同日）
      expect(taipeiDayKey('2026-09-03T15:59:00Z')).toBe('2026-09-03')
      // 2026-09-03T16:00Z = 2026-09-04 00:00 台北（隔日）
      expect(taipeiDayKey('2026-09-03T16:00:00Z')).toBe('2026-09-04')
    })
    it('空值 / 不合法回 null', () => {
      expect(taipeiDayKey(null)).toBeNull()
      expect(taipeiDayKey('not-a-date')).toBeNull()
    })
  })
})
