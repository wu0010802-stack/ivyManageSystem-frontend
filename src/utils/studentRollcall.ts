/**
 * 到園點名的純邏輯（2026-09-14 UI/UX 審查改版）。
 *
 * 改版前 view 把後端回的 `status=null` 一律預選成「出席」，27 列一進頁全部亮著，
 * 老師看不出誰還沒點；什麼都不碰按儲存就把全班記成出席，該發的缺席通知也不會發。
 * 這裡把「未點名」變成第一級狀態：
 *
 * - `null` 與 `''` 都是未點名（後端未點名回 null，前端清空回空字串）
 * - 儲存**只送已點的**（業主裁定 B，與才藝課程點名一致）：未點名的列不寫任何
 *   紀錄，`count_attendance_pending` 因此持續把它算成待辦，首頁徽章與本頁一致
 *
 * 抽成純函式是為了讓上述語意有測試守著——這些判斷散在元件裡時，單頁測試永遠綠。
 */

export const ROLLCALL_STATUSES = ['出席', '缺席', '病假', '事假', '遲到'] as const

export type RollcallStatus = (typeof ROLLCALL_STATUSES)[number]

/** 病假與事假在畫面上合併成「請假」一類（老師掃名冊時只關心「今天不在」）。 */
const LEAVE_STATUSES: readonly string[] = ['病假', '事假']

/** 家長請假核准後由後端寫入的備註型樣（services/student_leave_service.make_remark）。 */
const PARENT_LEAVE_REMARK = /^家長申請#\d+\s*/

export interface RollcallRecord {
  student_id?: number
  student_no?: string
  name?: string
  status?: string | null
  remark?: string | null
  [key: string]: unknown
}

export interface RollcallSummary {
  total: number
  unmarked: number
  present: number
  absent: number
  leave: number
  late: number
}

export type RollcallFilter = 'all' | 'unmarked' | 'leave' | RollcallStatus

export interface RollcallSaveEntry {
  student_id: number | undefined
  status: string
  remark: string | null
}

/** 未點名＝沒有狀態。後端未點名回 null，前端清空時可能是空字串，兩者等價。 */
export function isUnmarked(record: RollcallRecord): boolean {
  return !record.status
}

export function summarizeRollcall(records: RollcallRecord[]): RollcallSummary {
  const summary: RollcallSummary = {
    total: records.length,
    unmarked: 0,
    present: 0,
    absent: 0,
    leave: 0,
    late: 0,
  }
  for (const record of records) {
    if (isUnmarked(record)) summary.unmarked += 1
    else if (record.status === '出席') summary.present += 1
    else if (record.status === '缺席') summary.absent += 1
    else if (record.status === '遲到') summary.late += 1
    else if (LEAVE_STATUSES.includes(record.status as string)) summary.leave += 1
  }
  return summary
}

export function filterRollcall(
  records: RollcallRecord[],
  filter: RollcallFilter,
): RollcallRecord[] {
  if (filter === 'unmarked') return records.filter(isUnmarked)
  if (filter === 'leave') return records.filter((r) => LEAVE_STATUSES.includes(r.status as string))
  if ((ROLLCALL_STATUSES as readonly string[]).includes(filter)) {
    return records.filter((r) => r.status === filter)
  }
  // 'all' 與任何未知鍵：回全部。篩選鍵打錯時寧可多顯示，也不要讓名冊憑空消失。
  return records
}

/**
 * 送出前的 entries：**只含已點名的列**。
 *
 * 未點名的不進 payload，後端就不會為它建立紀錄，該生維持未點名。
 * 空備註送 null（後端 `remark` 為 nullable，空字串會變成「有備註但空白」）。
 */
export function buildSaveEntries(records: RollcallRecord[]): RollcallSaveEntry[] {
  return records
    .filter((record) => !isUnmarked(record))
    .map((record) => ({
      student_id: record.student_id,
      status: record.status as string,
      remark: record.remark || null,
    }))
}

/**
 * 拆解備註來源。家長請假核准會把備註寫成「家長申請#12」，原樣顯示在備註框裡
 * 對老師沒有意義，改成 chip + 老師自己的補充文字。
 */
export function parseRollcallRemark(remark: string | null | undefined): {
  fromParentLeave: boolean
  text: string
} {
  const raw = (remark ?? '').trim()
  if (!raw) return { fromParentLeave: false, text: '' }
  if (PARENT_LEAVE_REMARK.test(raw)) {
    return { fromParentLeave: true, text: raw.replace(PARENT_LEAVE_REMARK, '').trim() }
  }
  return { fromParentLeave: false, text: raw }
}

/**
 * 把老師輸入的備註文字接回原備註的來源前綴。
 *
 * 後端 `revert_attendance_for_leave` 只刪除備註吻合「家長申請#<id>」的列
 * （`is_remark_owned_by_leave`）。老師補字時若把前綴洗掉，家長之後撤銷請假就
 * 再也還原不了那一天，所以前綴一定要留著送回去。
 */
export function composeRollcallRemark(
  original: string | null | undefined,
  text: string,
): string {
  const raw = (original ?? '').trim()
  const typed = text.trim()
  const prefix = raw.match(PARENT_LEAVE_REMARK)?.[0]?.trim()
  if (!prefix) return typed
  return typed ? `${prefix} ${typed}` : prefix
}

/** 「上次儲存 08:41・吳逸倫」。無紀錄或時間無法解析時回空字串（呼叫端不畫這行）。 */
export function formatLastRecorded(
  at: string | null | undefined,
  by: string | null | undefined,
): string {
  if (!at) return ''
  const stamp = new Date(at)
  if (Number.isNaN(stamp.getTime())) return ''
  const hh = String(stamp.getHours()).padStart(2, '0')
  const mm = String(stamp.getMinutes()).padStart(2, '0')
  return by ? `上次儲存 ${hh}:${mm}・${by}` : `上次儲存 ${hh}:${mm}`
}

export interface MonthlySummarySource {
  month?: number
  school_days_count?: number
  classroom_record_completion_rate?: number
  classroom_attendance_rate?: number
  [key: string]: unknown
}

/**
 * 月統計摘要句。整月一筆都沒點時不講「出席率 0%」——那讀起來像全班缺席，
 * 但實際是沒人點名（審查 P2）。
 */
export function monthlySummaryText(data: MonthlySummarySource | null | undefined): string {
  if (!data) return ''
  const head = `${data.month} 月共 ${data.school_days_count} 個上課日`
  if (!data.classroom_record_completion_rate) return `${head}・尚未點名`
  return (
    `${head}・已點名 ${data.classroom_record_completion_rate}%` +
    `・出席率 ${data.classroom_attendance_rate}%`
  )
}

/** 單一學生的出席率標籤：整月未被點過時顯示「尚無紀錄」而非 0%。 */
export function attendanceRateLabel(
  rate: number | null | undefined,
  recordedDays: number | null | undefined,
): string {
  if (!recordedDays) return '尚無紀錄'
  return `${rate ?? 0}%`
}
