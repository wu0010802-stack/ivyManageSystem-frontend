import { describe, it, expect } from 'vitest'
import { parseTaipeiDate, formatTaipeiClock, taipeiHour } from '../taipeiTime'

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
})
