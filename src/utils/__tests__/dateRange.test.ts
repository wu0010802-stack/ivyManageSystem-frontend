import { describe, it, expect } from 'vitest'
import { todayRange, thisWeekRange, thisMonthRange, lastNDaysRange } from '@/utils/dateRange'

// 全部用「本地午夜過後不久」的時間點當 now：
// 台北 UTC+8 下，`toISOString()` 會回到 UTC（前一天 16:30），
// 任何走 UTC 的實作這些測試都會紅。
// 2026-06-12 是週五、2026-06-14 是週日。

describe('todayRange', () => {
  it('凌晨 00:30 仍回今天（UTC 版會偏成昨天）', () => {
    expect(todayRange(new Date(2026, 5, 12, 0, 30))).toEqual(['2026-06-12', '2026-06-12'])
  })

  it('起訖同一天', () => {
    const [start, end] = todayRange(new Date(2026, 5, 12, 15, 0))
    expect(start).toBe(end)
  })
})

describe('thisWeekRange', () => {
  it('週五凌晨回本週一到今天', () => {
    expect(thisWeekRange(new Date(2026, 5, 12, 0, 30))).toEqual(['2026-06-08', '2026-06-12'])
  })

  it('週日視為本週最後一天（週一起算）', () => {
    expect(thisWeekRange(new Date(2026, 5, 14, 12, 0))).toEqual(['2026-06-08', '2026-06-14'])
  })

  it('週一當天起訖同日', () => {
    expect(thisWeekRange(new Date(2026, 5, 8, 9, 0))).toEqual(['2026-06-08', '2026-06-08'])
  })
})

describe('thisMonthRange', () => {
  it('本月起點是本月 1 號（UTC 版在台北任何時刻都會回上月最後一天）', () => {
    expect(thisMonthRange(new Date(2026, 5, 12, 15, 0))).toEqual(['2026-06-01', '2026-06-12'])
  })

  it('凌晨 00:30 結束日仍是今天', () => {
    expect(thisMonthRange(new Date(2026, 5, 12, 0, 30))).toEqual(['2026-06-01', '2026-06-12'])
  })

  it('1 號當天起訖同日', () => {
    expect(thisMonthRange(new Date(2026, 5, 1, 8, 0))).toEqual(['2026-06-01', '2026-06-01'])
  })
})

describe('lastNDaysRange', () => {
  it('近 90 天跨月份正確回推', () => {
    expect(lastNDaysRange(90, new Date(2026, 5, 12, 0, 30))).toEqual(['2026-03-14', '2026-06-12'])
  })

  it('0 天起訖同日', () => {
    expect(lastNDaysRange(0, new Date(2026, 5, 12, 23, 0))).toEqual(['2026-06-12', '2026-06-12'])
  })
})
