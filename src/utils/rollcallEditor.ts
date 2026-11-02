/**
 * 管理端點名編修（AttendanceBatchPanel）的純邏輯。
 *
 * 2026-11-02 改版重點：
 * - 未點名維持 null。舊版載入時把未點名預設成「出席」，開抽屜改一位學生後存檔，
 *   會把整班還沒點名的孩子一起寫成出席，「未點名」這個資訊就此消失。
 * - 只送出有改動的學生。後端 batch 是 upsert，送整班會覆寫每一列的 recorded_by，
 *   也會蓋掉老師同時間在教師端點的結果。
 * - 批次「全部缺席」跳過已請假的學生：轉為缺席會即時 LINE 通知家長。
 * - 家長假單寫入的列（remark＝家長申請#id）被改成非請假時，remark 改寫成「原為家長請假（假單 #id）」：
 *   後端家長取消假單時（services/student_leave_service.revert_attendance_for_leave）會刪掉 remark
 *   仍等於「家長申請#id」的列，不改寫的話管理端改過的出席會被一起刪回未點名。
 */
import type { Schema } from '@/api/_generated/typed'

export const ROLLCALL_STATUSES = ['出席', '遲到', '缺席', '病假', '事假'] as const
export type RollcallStatus = (typeof ROLLCALL_STATUSES)[number]
export type RollcallFilter = 'all' | 'unmarked' | '出席' | '遲到' | '缺席' | 'leave'

type DailyRecord = Pick<Schema<'StudentAttendanceDailyRecordOut'>, 'student_id' | 'name' | 'status' | 'remark'> & {
  student_no?: string | null
}

export interface RollcallRow {
  student_id: number
  student_no: string | null
  name: string
  status: string | null
  remark: string
}

export interface RollcallBaseline {
  status: string | null
  remark: string
}

/** 後端家長請假核准時寫入 attendance.remark 的前綴（services/student_leave_service.py REMARK_PREFIX）。 */
const PARENT_LEAVE_PREFIX = '家長申請#'
const LEAVE_STATUSES = new Set(['病假', '事假'])

export function isLeaveStatus(status: string | null | undefined): boolean {
  return LEAVE_STATUSES.has(status ?? '')
}

export function overriddenLeaveRemark(leaveId: number): string {
  return `原為家長請假（假單 #${leaveId}）`
}

export function isParentLeaveRemark(remark: string | null | undefined): boolean {
  return parentLeaveId(remark) !== null
}

export function parentLeaveId(remark: string | null | undefined): number | null {
  const text = (remark ?? '').trim()
  if (!text.startsWith(PARENT_LEAVE_PREFIX)) return null
  const id = Number(text.slice(PARENT_LEAVE_PREFIX.length))
  return Number.isInteger(id) && id > 0 ? id : null
}

export function toRollcallRows(records: readonly DailyRecord[]): {
  rows: RollcallRow[]
  baseline: Map<number, RollcallBaseline>
} {
  const rows: RollcallRow[] = []
  const baseline = new Map<number, RollcallBaseline>()
  for (const r of records) {
    const status = r.status ?? null
    const remark = r.remark ?? ''
    rows.push({ student_id: r.student_id, student_no: r.student_no ?? null, name: r.name, status, remark })
    baseline.set(r.student_id, { status, remark })
  }
  return { rows, baseline }
}

export function summarizeRollcall(rows: readonly RollcallRow[]) {
  const s = { total: rows.length, present: 0, late: 0, absent: 0, leave: 0, unmarked: 0 }
  for (const r of rows) {
    if (!r.status) s.unmarked += 1
    else if (r.status === '出席') s.present += 1
    else if (r.status === '遲到') s.late += 1
    else if (r.status === '缺席') s.absent += 1
    else if (LEAVE_STATUSES.has(r.status)) s.leave += 1
  }
  return s
}

export function matchesRollcallFilter(row: RollcallRow, filter: RollcallFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'unmarked') return !row.status
  if (filter === 'leave') return LEAVE_STATUSES.has(row.status ?? '')
  return row.status === filter
}

export function isRowDirty(row: RollcallRow, base: RollcallBaseline | undefined): boolean {
  if (!base) return true
  return row.status !== base.status || row.remark.trim() !== base.remark.trim()
}

/** 只送出有改動、且已選狀態的學生（後端狀態必填；只填備註沒選狀態的人留在畫面上提示）。 */
export function buildBatchEntries(
  rows: readonly RollcallRow[],
  baseline: ReadonlyMap<number, RollcallBaseline>,
): { student_id: number; status: string; remark: string | null }[] {
  return rows
    .filter(r => r.status && isRowDirty(r, baseline.get(r.student_id)))
    .map((r) => {
      const leaveId = parentLeaveId(baseline.get(r.student_id)?.remark)
      const remark = leaveId != null && !isLeaveStatus(r.status) && r.remark.trim() === baseline.get(r.student_id)?.remark.trim()
        ? overriddenLeaveRemark(leaveId)
        : r.remark.trim() || null
      return { student_id: r.student_id, status: r.status as string, remark }
    })
}

export function newlyAbsentCount(
  rows: readonly RollcallRow[],
  baseline: ReadonlyMap<number, RollcallBaseline>,
): number {
  return rows.filter(r => r.status === '缺席' && baseline.get(r.student_id)?.status !== '缺席').length
}

/** 未點名的人補上狀態（預設出席），回傳實際改了幾位。 */
export function fillUnmarked(rows: RollcallRow[], status: RollcallStatus = '出席'): number {
  let n = 0
  for (const r of rows) {
    if (r.status) continue
    r.status = status
    n += 1
  }
  return n
}

/** 除了已請假的學生，其餘全部標缺席；回傳實際改了幾位。 */
export function markAllAbsent(rows: RollcallRow[]): number {
  let n = 0
  for (const r of rows) {
    if (LEAVE_STATUSES.has(r.status ?? '') || r.status === '缺席') continue
    r.status = '缺席'
    n += 1
  }
  return n
}
