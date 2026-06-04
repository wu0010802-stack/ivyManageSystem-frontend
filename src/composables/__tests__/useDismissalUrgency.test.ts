import { describe, it, expect } from 'vitest'
import {
  parseTaipeiDate,
  elapsedMinutes,
  urgencyLevel,
  formatWaited,
  monogramOf,
  sortByOldestFirst,
  URGENCY_WARNING_MIN,
  URGENCY_CRITICAL_MIN,
} from '../useDismissalUrgency'

describe('useDismissalUrgency 純函式', () => {
  describe('parseTaipeiDate — 台北時區錨定', () => {
    it('無 offset 的 naive 字串錨定為 +08:00（與顯式 +08:00 同一時刻）', () => {
      const naive = parseTaipeiDate('2026-06-04T16:00:00')
      const explicit = new Date('2026-06-04T16:00:00+08:00')
      expect(naive?.getTime()).toBe(explicit.getTime())
    })

    it('已帶 Z 的字串原樣解析（不再加 +08:00）', () => {
      const z = parseTaipeiDate('2026-06-04T08:00:00Z')
      expect(z?.getTime()).toBe(new Date('2026-06-04T08:00:00Z').getTime())
    })

    it('已帶 +08:00 的字串原樣解析', () => {
      const off = parseTaipeiDate('2026-06-04T16:00:00+08:00')
      expect(off?.getTime()).toBe(new Date('2026-06-04T16:00:00+08:00').getTime())
    })

    it('空值與不合法字串回 null', () => {
      expect(parseTaipeiDate(null)).toBeNull()
      expect(parseTaipeiDate(undefined)).toBeNull()
      expect(parseTaipeiDate('')).toBeNull()
      expect(parseTaipeiDate('not-a-date')).toBeNull()
    })
  })

  describe('elapsedMinutes', () => {
    const base = new Date('2026-06-04T16:00:00+08:00').getTime()

    it('剛建立回 0', () => {
      expect(elapsedMinutes('2026-06-04T16:00:00', base)).toBe(0)
    })

    it('過 5 分 30 秒向下取整為 5', () => {
      expect(elapsedMinutes('2026-06-04T16:00:00', base + 5 * 60000 + 30000)).toBe(5)
    })

    it('未來時間（時鐘漂移）夾為 0，不出現負數', () => {
      expect(elapsedMinutes('2026-06-04T16:00:00', base - 120000)).toBe(0)
    })

    it('無 requested_at 回 null', () => {
      expect(elapsedMinutes(null, base)).toBeNull()
    })
  })

  describe('urgencyLevel — 3 分琥珀 / 8 分紅 門檻邊界', () => {
    it('未知（null）視為 normal', () => {
      expect(urgencyLevel(null)).toBe('normal')
    })
    it('門檻以下為 normal', () => {
      expect(urgencyLevel(0)).toBe('normal')
      expect(urgencyLevel(URGENCY_WARNING_MIN - 1)).toBe('normal')
    })
    it('達琥珀門檻（含）為 warning，直到紅門檻前', () => {
      expect(urgencyLevel(URGENCY_WARNING_MIN)).toBe('warning')
      expect(urgencyLevel(URGENCY_CRITICAL_MIN - 1)).toBe('warning')
    })
    it('達紅門檻（含）以上為 critical', () => {
      expect(urgencyLevel(URGENCY_CRITICAL_MIN)).toBe('critical')
      expect(urgencyLevel(30)).toBe('critical')
    })
  })

  describe('formatWaited', () => {
    it('null 回空字串', () => {
      expect(formatWaited(null)).toBe('')
    })
    it('0 分顯示「剛剛」', () => {
      expect(formatWaited(0)).toBe('剛剛')
    })
    it('一小時內顯示分鐘', () => {
      expect(formatWaited(1)).toBe('等候 1 分')
      expect(formatWaited(59)).toBe('等候 59 分')
    })
    it('滿一小時顯示時，整點不帶 0 分', () => {
      expect(formatWaited(60)).toBe('等候 1 小時')
      expect(formatWaited(75)).toBe('等候 1 小時 15 分')
    })
  })

  describe('monogramOf', () => {
    it('取中文姓氏首字', () => {
      expect(monogramOf('陳小明')).toBe('陳')
    })
    it('英文首字母大寫', () => {
      expect(monogramOf('amy')).toBe('A')
    })
    it('空值 / 純空白回問號', () => {
      expect(monogramOf('')).toBe('？')
      expect(monogramOf('   ')).toBe('？')
      expect(monogramOf(null)).toBe('？')
      expect(monogramOf(undefined)).toBe('？')
    })
  })

  describe('sortByOldestFirst — 最久等候優先', () => {
    it('依 requested_at 由舊到新，且不變動原陣列', () => {
      const input = [
        { id: 1, requested_at: '2026-06-04T16:10:00' },
        { id: 2, requested_at: '2026-06-04T16:00:00' },
        { id: 3, requested_at: '2026-06-04T16:05:00' },
      ]
      const sorted = sortByOldestFirst(input)
      expect(sorted.map((c) => c.id)).toEqual([2, 3, 1])
      // 原陣列順序不變
      expect(input.map((c) => c.id)).toEqual([1, 2, 3])
    })

    it('缺 requested_at 的項目排最前（視為時刻 0）', () => {
      const input = [
        { id: 1, requested_at: '2026-06-04T16:00:00' },
        { id: 2, requested_at: undefined },
      ]
      expect(sortByOldestFirst(input).map((c) => c.id)).toEqual([2, 1])
    })
  })
})
