/**
 * 換班對象選單的「同事當日職務」加註（SPEC-026 §4.4 T5）。
 *
 * 後端 GET /portal/schedule/day-roster 回候選同事（與 /swap-candidates 同一群）當天的有效班別
 * 與「時段是否與自己相同」；這裡把它併進既有 /swap-candidates 候選：加上顯示用的 duty_label，
 * 並把時段相同者（換了也沒差，不用登記）排到最後。純函式、不改輸入。
 */
import type { ApiResponse } from '@/api/_generated/typed'

export type DayRosterEntry = ApiResponse<'/portal/schedule/day-roster', 'get'>[number]

/** 併入候選後多出的顯示用欄位。 */
export interface RosterAnnotation {
  duty_label?: string
  same_time?: boolean
}

/** /swap-candidates 單筆的寬鬆型別（codegen 的 work_start 為 string | null，這裡 narrow 成 string）。 */
export interface SwapCandidateBase {
  employee_id?: number
  name?: string
  shift_name?: string
  work_start?: string
  work_end?: string
  has_pending_swap?: boolean
  [key: string]: unknown
}

export type SwapCandidateView = SwapCandidateBase & RosterAnnotation

export const SAME_TIME_HINT = '時段相同，不用登記'

/** 同事當日職務的顯示文字：排休／班別名稱＋時段／個人工時＋時段／未排班（預設）。 */
export function formatRosterDuty(entry: DayRosterEntry): string {
  if (entry.source === 'daily_off') return '排休'
  const span = entry.work_start && entry.work_end ? `${entry.work_start}~${entry.work_end}` : ''
  if (entry.shift_name) return span ? `${entry.shift_name} ${span}` : entry.shift_name
  const origin = entry.source === 'employee' ? '個人工時' : '未排班（預設）'
  return span ? `${origin} ${span}` : origin
}

/**
 * 以 employee_id 把 roster 併進候選：加註 duty_label／same_time，並把時段相同者穩定地排到最後。
 * roster 沒有的候選原樣保留（例如 roster 載入失敗時整批不加註）。
 */
export function mergeRosterIntoCandidates<T extends { employee_id?: number }>(
  candidates: readonly T[],
  roster: readonly DayRosterEntry[],
): Array<T & RosterAnnotation> {
  const byId = new Map(roster.map((r) => [r.employee_id, r]))
  const annotated = candidates.map((c): T & RosterAnnotation => {
    const hit = c.employee_id === undefined ? undefined : byId.get(c.employee_id)
    return hit
      ? { ...c, duty_label: formatRosterDuty(hit), same_time: hit.same_time_as_me }
      : { ...c }
  })
  return [...annotated.filter((c) => !c.same_time), ...annotated.filter((c) => c.same_time)]
}
