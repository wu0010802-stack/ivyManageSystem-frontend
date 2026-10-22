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
