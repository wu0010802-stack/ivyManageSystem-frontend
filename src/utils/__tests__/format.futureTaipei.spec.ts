import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAfterTaipeiToday } from '@/utils/format'

describe('isAfterTaipeiToday（日期選擇器禁選台北「今日」之後）', () => {
  afterEach(() => vi.useRealTimers())

  it('台北 2026-11-02 當日：今日可選、明日不可選、昨日可選', () => {
    // 2026-11-02 10:00 UTC = 台北 18:00
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'))
    expect(isAfterTaipeiToday(new Date(2026, 10, 2))).toBe(false)
    expect(isAfterTaipeiToday(new Date(2026, 10, 3))).toBe(true)
    expect(isAfterTaipeiToday(new Date(2026, 10, 1))).toBe(false)
  })

  it('UTC 仍是 11-01 但台北已跨日到 11-02：以台北為準，11-02 可選', () => {
    // 2026-11-01 20:00 UTC = 台北 11-02 04:00
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T20:00:00Z'))
    expect(isAfterTaipeiToday(new Date(2026, 10, 2))).toBe(false)
    expect(isAfterTaipeiToday(new Date(2026, 10, 3))).toBe(true)
  })

  it('非法輸入不禁用', () => {
    expect(isAfterTaipeiToday(new Date('x'))).toBe(false)
  })
})
