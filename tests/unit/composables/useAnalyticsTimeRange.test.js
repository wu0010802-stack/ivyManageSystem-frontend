import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAnalyticsTimeRange } from '@/composables/useAnalyticsTimeRange'

describe('useAnalyticsTimeRange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-23T10:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('預設為本學期', () => {
    const { start, end, label } = useAnalyticsTimeRange()
    expect(label.value).toBe('本學期')
    // 2026-04-23 → 下學期（2/1 ~ 7/31）
    expect(start.value).toBe('2026-02-01')
    expect(end.value).toBe('2026-07-31')
  })

  it('套用「本月」預設', () => {
    const { start, end, applyPreset, label } = useAnalyticsTimeRange()
    applyPreset('this_month')
    expect(label.value).toBe('本月')
    expect(start.value).toBe('2026-04-01')
    expect(end.value).toBe('2026-04-30')
  })

  it('套用「本學年」預設（8/1 ~ 隔年 7/31）', () => {
    const { start, end, applyPreset } = useAnalyticsTimeRange()
    applyPreset('this_academic_year')
    // 2026-04-23 仍在 2025 學年內（2025/8/1 ~ 2026/7/31）
    expect(start.value).toBe('2025-08-01')
    expect(end.value).toBe('2026-07-31')
  })

  it('自訂區間', () => {
    const { start, end, applyCustom } = useAnalyticsTimeRange()
    applyCustom('2026-01-01', '2026-03-31')
    expect(start.value).toBe('2026-01-01')
    expect(end.value).toBe('2026-03-31')
  })
})
