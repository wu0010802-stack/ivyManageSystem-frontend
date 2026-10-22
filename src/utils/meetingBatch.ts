import type { ApiBody } from '@/api/_generated/typed'

export type MeetingBatchPayload = ApiBody<'/meetings/batch', 'post'>

export interface MeetingBatchAttendance {
  id: number
  attended: boolean
  /** 逐人覆寫時數；null＝沿用場次時數 */
  hours: number | null
}

/**
 * 組批次園務會議 payload（義華比對 #22）。
 * - meetingHours 為 null → 不送，後端沿用 BonusConfig 預設時數（舊行為）
 * - 只有出席者、且時數與場次時數不同的才送 hours_overrides
 */
export function buildMeetingBatchPayload(
  form: { meeting_date: string; meeting_type: string; remark: string },
  meetingHours: number | null,
  rows: MeetingBatchAttendance[],
): Partial<MeetingBatchPayload> & Pick<MeetingBatchPayload, 'meeting_date' | 'attendees'> {
  const attendees = rows.filter(r => r.attended).map(r => r.id)
  const absentees = rows.filter(r => !r.attended).map(r => r.id)
  const overrides: Record<string, number> = {}
  for (const row of rows) {
    if (row.attended && row.hours !== null && row.hours !== meetingHours) {
      overrides[String(row.id)] = row.hours
    }
  }
  return {
    meeting_date: form.meeting_date,
    meeting_type: form.meeting_type,
    remark: form.remark,
    attendees,
    absentees,
    ...(meetingHours !== null ? { meeting_hours: meetingHours } : {}),
    ...(Object.keys(overrides).length > 0 ? { hours_overrides: overrides } : {}),
  }
}
