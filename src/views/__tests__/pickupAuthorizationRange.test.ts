import { describe, expect, it } from 'vitest'
import {
  MAX_HISTORY_RANGE_DAYS,
  exceedsHistoryRange,
  isBeyondHistoryRange,
} from '../pickupAuthorizationRange'

describe('pickupAuthorizationRange（歷史查詢區間上限，對齊後端 MAX_RANGE_DAYS）', () => {
  it('上限 92 天', () => {
    expect(MAX_HISTORY_RANGE_DAYS).toBe(92)
  })

  it('起訖相差 92 天以內可查，93 天以上超過', () => {
    expect(exceedsHistoryRange(['2026-01-01', '2026-04-03'])).toBe(false)
    expect(exceedsHistoryRange(['2026-01-01', '2026-04-04'])).toBe(true)
    expect(exceedsHistoryRange(['2026-08-10', '2026-08-10'])).toBe(false)
  })

  it('跨夏令時間或閏年也照日曆天數算', () => {
    expect(exceedsHistoryRange(['2028-01-01', '2028-04-02'])).toBe(false) // 2028 閏年：相差 92 天
    expect(exceedsHistoryRange(['2028-01-01', '2028-04-03'])).toBe(true)
  })

  it('尚未點起日時不鎖任何日期；點了起日後，離起日超過 92 天的前後日期都不可選', () => {
    const start = new Date(2026, 0, 1)
    expect(isBeyondHistoryRange(new Date(2027, 0, 1), null)).toBe(false)
    expect(isBeyondHistoryRange(new Date(2026, 3, 3), start)).toBe(false)
    expect(isBeyondHistoryRange(new Date(2026, 3, 4), start)).toBe(true)
    expect(isBeyondHistoryRange(new Date(2025, 9, 1), start)).toBe(false)
    expect(isBeyondHistoryRange(new Date(2025, 8, 30), start)).toBe(true)
  })
})
