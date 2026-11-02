import type { ApiBody } from '@/api/_generated/typed'

export type MeetingBatchPayload = ApiBody<'/meetings/batch', 'post'>

export interface MeetingBatchAttendance {
  id: number
  attended: boolean
  /** 逐人覆寫時數；null＝沿用場次時數（時段模式下＝沿用排班算出的時數） */
  hours: number | null
  /** 時段模式：後端依當天排班算出的時數（GET /meetings/shift-hours）；未取得為 undefined */
  suggested?: number | null
}

/**
 * 組批次園務會議 payload（義華比對 #22；mtgshift01 會議時段）。
 * - window 有值（時段模式）→ 送 meeting_start_time／meeting_end_time，後端依每人排班算時數，
 *   不送整場時數；手動改過且不同於排班建議的出席者才送 hours_overrides
 * - 否則：meetingHours 為 null → 不送，後端沿用 BonusConfig 預設時數（舊行為）；
 *   只有出席者、且時數與場次時數不同的才送 hours_overrides
 */
export function buildMeetingBatchPayload(
  form: { meeting_date: string; meeting_type: string; remark: string },
  meetingHours: number | null,
  rows: MeetingBatchAttendance[],
  window: { start: string; end: string } | null = null,
): Partial<MeetingBatchPayload> & Pick<MeetingBatchPayload, 'meeting_date' | 'attendees'> {
  const attendees = rows.filter(r => r.attended).map(r => r.id)
  const absentees = rows.filter(r => !r.attended).map(r => r.id)
  const overrides: Record<string, number> = {}
  for (const row of rows) {
    const baseline = window ? row.suggested : meetingHours
    if (row.attended && row.hours !== null && row.hours !== baseline) {
      overrides[String(row.id)] = row.hours
    }
  }
  const hoursPart = window
    ? { meeting_start_time: window.start, meeting_end_time: window.end }
    : meetingHours !== null
      ? { meeting_hours: meetingHours }
      : {}
  return {
    meeting_date: form.meeting_date,
    meeting_type: form.meeting_type,
    remark: form.remark,
    attendees,
    absentees,
    ...hoursPart,
    ...(Object.keys(overrides).length > 0 ? { hours_overrides: overrides } : {}),
  }
}
