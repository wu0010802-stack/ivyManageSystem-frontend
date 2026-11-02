import type { Schema } from '@/api/_generated/typed'

/**
 * 園務會議時段（mtgshift01，義華 2026-11-02）。
 * 獎金設定填了會議開始／結束時間，批次登錄就依每人當天排班算時數：
 * 會議時段中排班下班之後的部分才算加班（17:30–18:30 會議，18:00 下班＝0.5 小時）。
 * 時數由後端計算（GET /meetings/shift-hours 預覽、POST /meetings/batch 寫入），此檔只做顯示與前置檢查。
 */

export type MeetingShiftHoursItem = Schema<'MeetingShiftHoursItem'>

/** 兩欄須同時填或同時清空、結束晚於開始；合法回 null，否則回錯誤訊息（與後端 parse_meeting_window 同規則）。 */
export function validateMeetingWindow(start: string | null, end: string | null): string | null {
  const s = start || ''
  const e = end || ''
  if (!s && !e) return null
  if (!s || !e) return '會議開始與結束時間須同時填寫或同時清空'
  if (e <= s) return '會議結束時間須晚於開始時間'
  return null
}

const SOURCE_LABEL: Record<string, string> = {
  daily: '當日調班',
  weekly: '排班',
  employee: '員工工時',
}

/** 名單上說明「為什麼是這個時數」：依排班來源與下班時間。 */
export function describeShiftHours(item: Pick<MeetingShiftHoursItem, 'source' | 'shift_end'>): string {
  if (item.source === 'daily_off') return '當天排休'
  if (item.source === 'default') return `未排班（${item.shift_end} 下班）`
  return `${SOURCE_LABEL[item.source] ?? '排班'} ${item.shift_end} 下班`
}

/** 1 → '1'、0.5 → '0.5'、0.33 → '0.33'。 */
export function formatMeetingHours(hours: number): string {
  return String(Number(hours.toFixed(2)))
}
