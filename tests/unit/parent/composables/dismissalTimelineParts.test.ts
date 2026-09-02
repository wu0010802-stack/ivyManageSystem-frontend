/**
 * dismissalTimelineParts（pnotice01）：today timeline 的 dismissal 語意純函式。
 * 避免與追蹤卡矛盾：預告顯示預計抵達、抵達後顯示已到門口、staff 舊流程不變。
 */
import { describe, it, expect } from 'vitest'
import { dismissalTimelineParts } from '@/parent/composables/useTodayTimeline'

describe('dismissalTimelineParts', () => {
  it('家長預告未抵達：時間=預計抵達、文案帶「已預告 · 預計 HH:MM 抵達」、導向 /pickup-notice', () => {
    const parts = dismissalTimelineParts({
      status: 'pending',
      request_source: 'parent',
      requested_at: '2026-08-14T15:00:00',
      expected_arrival_at: '2026-08-14T15:15:00',
    })
    expect(parts.sourceTs).toBe('2026-08-14T15:15:00')
    expect(parts.secondary).toContain('已預告')
    expect(parts.secondary).toContain('15:15')
    expect(parts.secondary).toContain('老師處理中')
    expect(parts.path).toBe('/pickup-notice')
  })

  it('家長已到門口未完成：時間=arrived_at、文案「已到門口 · 老師已收到」', () => {
    const parts = dismissalTimelineParts({
      status: 'acknowledged',
      request_source: 'parent',
      requested_at: '2026-08-14T15:00:00',
      expected_arrival_at: '2026-08-14T15:15:00',
      arrived_at: '2026-08-14T15:14:00',
      acknowledged_at: '2026-08-14T15:05:00',
    })
    expect(parts.sourceTs).toBe('2026-08-14T15:14:00')
    expect(parts.secondary).toBe('已到門口 · 老師已收到')
    expect(parts.path).toBe('/pickup-notice')
  })

  it('完成：行為與改造前一致（completed_at、已離園、/attendance）', () => {
    const parts = dismissalTimelineParts({
      status: 'completed',
      request_source: 'parent',
      requested_at: '2026-08-14T15:00:00',
      completed_at: '2026-08-14T15:20:00',
    })
    expect(parts.sourceTs).toBe('2026-08-14T15:20:00')
    expect(parts.secondary).toBe('已離園')
    expect(parts.path).toBe('/attendance')
  })

  it('staff 舊流程（無來源標記亦同）：acknowledged_at || requested_at、/attendance', () => {
    const parts = dismissalTimelineParts({
      status: 'pending',
      request_source: 'staff',
      requested_at: '2026-08-14T15:00:00',
      expected_arrival_at: '2026-08-14T15:00:00',
      arrived_at: '2026-08-14T15:00:00',
    })
    expect(parts.sourceTs).toBe('2026-08-14T15:00:00')
    expect(parts.secondary).toBe('老師處理中')
    expect(parts.path).toBe('/attendance')

    const legacy = dismissalTimelineParts({
      status: 'acknowledged',
      requested_at: '2026-08-14T15:00:00',
      acknowledged_at: '2026-08-14T15:03:00',
    })
    expect(legacy.sourceTs).toBe('2026-08-14T15:03:00')
    expect(legacy.secondary).toBe('老師已收到')
    expect(legacy.path).toBe('/attendance')
  })
})
