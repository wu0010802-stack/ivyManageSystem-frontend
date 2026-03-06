import { describe, it, expect } from 'vitest'
import { getMonthWeeks } from '@/utils/scheduleUtils'

describe('getMonthWeeks', () => {
  it('2026年3月回傳5個週一（標準月份）', () => {
    // 2026-03-01 是星期日，所以第一個週一是 03-02
    const weeks = getMonthWeeks(2026, 3)
    expect(weeks).toEqual([
      '2026-03-02',
      '2026-03-09',
      '2026-03-16',
      '2026-03-23',
      '2026-03-30',
    ])
    expect(weeks).toHaveLength(5)
  })

  it('月初恰為週一時，第一個元素即為月初', () => {
    // 2026-06-01 是星期一
    const weeks = getMonthWeeks(2026, 6)
    expect(weeks[0]).toBe('2026-06-01')
  })

  it('2026年2月回傳4個週一', () => {
    // 2026-02-01 是星期日，第一個週一是 02-02
    const weeks = getMonthWeeks(2026, 2)
    expect(weeks).toEqual([
      '2026-02-02',
      '2026-02-09',
      '2026-02-16',
      '2026-02-23',
    ])
    expect(weeks).toHaveLength(4)
  })

  it('回傳值格式為 YYYY-MM-DD 字串', () => {
    const weeks = getMonthWeeks(2026, 3)
    for (const w of weeks) {
      expect(w).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
