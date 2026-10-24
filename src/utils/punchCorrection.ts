/** 補卡類型：補上班、補下班、補全天 */
export type CorrectionType = 'punch_in' | 'punch_out' | 'both'

/**
 * 依補卡類型只組出對應那側的申請時間（YYYY-MM-DDTHH:mm:00）。先選補全天填了兩側、再改成補單側時，
 * 隱藏那側的時間不能跟著送出，否則後端會連另一側一起改寫（QA P3）。
 */
export function correctionTimes(
  type: CorrectionType,
  date: string,
  punchIn: string,
  punchOut: string,
): { requested_punch_in: string | null; requested_punch_out: string | null } {
  const at = (time: string, wanted: boolean) => (wanted && date && time ? `${date}T${time}:00` : null)
  return {
    requested_punch_in: at(punchIn, type !== 'punch_out'),
    requested_punch_out: at(punchOut, type !== 'punch_in'),
  }
}
