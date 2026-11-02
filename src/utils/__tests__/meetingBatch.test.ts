import { describe, it, expect } from 'vitest'
import { buildMeetingBatchPayload } from '../meetingBatch'

const base = { meeting_date: '2026-09-10', meeting_type: 'staff_meeting', remark: '' }

describe('buildMeetingBatchPayload（義華比對 #22：批次會議時數＋逐人覆寫）', () => {
  it('未填場次時數與逐人時數 → 不送 meeting_hours／hours_overrides（後端沿用預設）', () => {
    const payload = buildMeetingBatchPayload(base, null, [
      { id: 1, attended: true, hours: null },
      { id: 2, attended: false, hours: null },
    ])
    expect(payload).toEqual({ ...base, attendees: [1], absentees: [2] })
  })

  it('場次時數 1.5h、出席者逐人覆寫 1h；缺席者的時數不送', () => {
    const payload = buildMeetingBatchPayload(base, 1.5, [
      { id: 1, attended: true, hours: null },
      { id: 2, attended: true, hours: 1 },
      { id: 3, attended: false, hours: 2 },
    ])
    expect(payload.meeting_hours).toBe(1.5)
    expect(payload.hours_overrides).toEqual({ 2: 1 })
    expect(payload.attendees).toEqual([1, 2])
    expect(payload.absentees).toEqual([3])
  })

  it('逐人時數等於場次時數時不必覆寫', () => {
    const payload = buildMeetingBatchPayload(base, 2, [{ id: 1, attended: true, hours: 2 }])
    expect(payload.hours_overrides).toBeUndefined()
  })
})

describe('buildMeetingBatchPayload 會議時段模式（mtgshift01：依排班算每人時數）', () => {
  const window = { start: '17:30', end: '18:30' }

  it('送會議時段、不送整場時數；未改的人交給後端依排班算', () => {
    const payload = buildMeetingBatchPayload(
      base,
      1.5,
      [
        { id: 1, attended: true, hours: null, suggested: 0.5 },
        { id: 2, attended: true, hours: null, suggested: 1 },
      ],
      window,
    )
    expect(payload.meeting_start_time).toBe('17:30')
    expect(payload.meeting_end_time).toBe('18:30')
    expect(payload.meeting_hours).toBeUndefined()
    expect(payload.hours_overrides).toBeUndefined()
  })

  it('手動改過且不同於排班建議 → 送逐人覆寫；改回建議值不送', () => {
    const payload = buildMeetingBatchPayload(
      base,
      null,
      [
        { id: 1, attended: true, hours: 0.25, suggested: 0.5 },
        { id: 2, attended: true, hours: 1, suggested: 1 },
        { id: 3, attended: false, hours: 1, suggested: 1 },
      ],
      window,
    )
    expect(payload.hours_overrides).toEqual({ 1: 0.25 })
  })

  it('手動改成 0 也要送（18:00 下班者被要求留下但不計）', () => {
    const payload = buildMeetingBatchPayload(
      base,
      null,
      [{ id: 1, attended: true, hours: 0, suggested: 0.5 }],
      window,
    )
    expect(payload.hours_overrides).toEqual({ 1: 0 })
  })
})
