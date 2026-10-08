/**
 * 學期輪值表網格純邏輯（SPEC-026 §2.5）。
 *
 * 編輯狀態以 uid 識別職務列（已存檔列 `r<id>`、新列 `n<序號>`），格子以
 * `週一日期|uid` 為鍵；送出時轉成後端整份覆寫格式（cells 以 row_index 指向 rows）。
 */
import type { ApiBody, ApiResponse } from '@/api/_generated/typed'

export type RotationOut = ApiResponse<'/duty-rotations', 'get'>
export type RotationDocumentBody = ApiBody<'/duty-rotations/{rotation_id}', 'put'>
export type RotationIssue = RotationOut['issues'][number]
export type RotationClassroom = RotationOut['classrooms'][number]
export type ApplyResult = ApiResponse<'/duty-rotations/{rotation_id}/apply', 'post'>
export type ApplyChange = ApplyResult['changes'][number]
export type TeacherRole = 'head' | 'assistant'

/**
 * 套用預覽起始週選單的「全部週」哨兵值（Final re-review R2）。Element Plus
 * 2.13.2 的 `DEFAULT_EMPTY_VALUES` 含 `null`（`hooks/use-empty-values`），
 * 若直接把 `null` 當 `el-option` 的 value，`hasModelValue` 恆為 false，選單
 * 只會顯示 placeholder、看不到「全部週」。呼叫端只在邊界（初始化、組
 * API payload）與 `null` 互轉，元件內部一律用這個字串。
 */
export const ALL_WEEKS = '__all__'

export const ROLE_LABELS: Record<TeacherRole, string> = { head: '班導', assistant: '副班導' }
export const SKIP_REASON_LABELS: Record<string, string> = {
  manual: '行政手動設定過',
  finalized: '該月薪資已封存',
  recorded: '該週已有打卡紀錄',
}
export const ACTION_LABELS: Record<string, string> = {
  create: '新增',
  update: '更新',
  removed: '移除',
  unchanged: '不變',
  skip: '略過',
}

export interface EditableRow {
  uid: string
  sourceId: number | null
  label: string
  teacher_role: TeacherRole
  shift_type_id: number | null
  sort_order: number
}

export interface EditableWeek {
  week_start_date: string
  label: string
}

export interface EditableState {
  name: string
  default_head_shift_type_id: number | null
  default_assistant_shift_type_id: number | null
  rows: EditableRow[]
  weeks: EditableWeek[]
  cells: Record<string, number>
}

export const cellKey = (week: string, rowUid: string): string => `${week}|${rowUid}`

const byWeek = (a: EditableWeek, b: EditableWeek) => a.week_start_date.localeCompare(b.week_start_date)

let newRowSeq = 0

export function fromRotation(r: RotationOut): EditableState {
  const rows: EditableRow[] = [...r.rows]
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((row) => ({
      uid: `r${row.id}`,
      sourceId: row.id,
      label: row.label,
      teacher_role: row.teacher_role,
      shift_type_id: row.shift_type_id,
      sort_order: row.sort_order,
    }))
  const cells: Record<string, number> = {}
  for (const c of r.cells) cells[cellKey(c.week_start_date, `r${c.row_id}`)] = c.classroom_id
  return {
    name: r.name,
    default_head_shift_type_id: r.default_head_shift_type_id ?? null,
    default_assistant_shift_type_id: r.default_assistant_shift_type_id ?? null,
    rows,
    weeks: r.weeks.map((w) => ({ week_start_date: w.week_start_date, label: w.label })).sort(byWeek),
    cells,
  }
}

export function toDocumentBody(s: EditableState): RotationDocumentBody {
  const rows = s.rows.map((row, index) => {
    const label = row.label.trim()
    if (!label) throw new Error(`第 ${index + 1} 個職務列沒有名稱`)
    if (row.shift_type_id == null) throw new Error(`職務「${label}」尚未選擇班別`)
    return { label, teacher_role: row.teacher_role, shift_type_id: row.shift_type_id, sort_order: index }
  })
  const indexByUid = new Map(s.rows.map((row, i) => [row.uid, i]))
  const weekSet = new Set(s.weeks.map((w) => w.week_start_date))
  const cells = Object.entries(s.cells)
    .flatMap(([key, classroomId]) => {
      const [week = '', uid = ''] = key.split('|')
      const rowIndex = indexByUid.get(uid)
      if (rowIndex === undefined || !weekSet.has(week)) return []
      return [{ week_start_date: week, row_index: rowIndex, classroom_id: classroomId }]
    })
    .sort((a, b) => a.week_start_date.localeCompare(b.week_start_date) || a.row_index - b.row_index)
  return {
    name: s.name.trim(),
    default_head_shift_type_id: s.default_head_shift_type_id,
    default_assistant_shift_type_id: s.default_assistant_shift_type_id,
    rows,
    weeks: [...s.weeks].sort(byWeek),
    cells,
  }
}

export function setCell(s: EditableState, week: string, rowUid: string, classroomId: number | null): EditableState {
  const cells = { ...s.cells }
  const key = cellKey(week, rowUid)
  if (classroomId == null) delete cells[key]
  else cells[key] = classroomId
  return { ...s, cells }
}

export function addRow(s: EditableState, role: TeacherRole): EditableState {
  newRowSeq += 1
  const row: EditableRow = {
    uid: `n${newRowSeq}`,
    sourceId: null,
    label: '',
    teacher_role: role,
    shift_type_id: null,
    sort_order: s.rows.length,
  }
  return { ...s, rows: [...s.rows, row] }
}

export function removeRow(s: EditableState, uid: string): EditableState {
  const cells = Object.fromEntries(Object.entries(s.cells).filter(([k]) => !k.endsWith(`|${uid}`)))
  return { ...s, rows: s.rows.filter((r) => r.uid !== uid), cells }
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

export function generateWeeks(start: string, end: string, firstNumber = 1): EditableWeek[] {
  const cursor = new Date(`${start}T12:00:00`)
  const last = new Date(`${end}T12:00:00`)
  cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7)) // 推到當週或下一個週一
  const weeks: EditableWeek[] = []
  let n = firstNumber
  while (cursor <= last) {
    weeks.push({ week_start_date: toIso(cursor), label: pad2(n) })
    n += 1
    cursor.setDate(cursor.getDate() + 7)
  }
  return weeks
}

export function mergeWeeks(existing: EditableWeek[], added: EditableWeek[]): EditableWeek[] {
  const map = new Map(added.map((w) => [w.week_start_date, w]))
  for (const w of existing) map.set(w.week_start_date, w)
  return [...map.values()].sort(byWeek)
}

export function removeWeek(s: EditableState, week: string): EditableState {
  const cells = Object.fromEntries(Object.entries(s.cells).filter(([k]) => !k.startsWith(`${week}|`)))
  return { ...s, weeks: s.weeks.filter((w) => w.week_start_date !== week), cells }
}

export function issueSeverityByCell(issues: RotationIssue[], rows: EditableRow[]): Map<string, 'error' | 'warning'> {
  const uidBySource = new Map(rows.filter((r) => r.sourceId != null).map((r) => [r.sourceId, r.uid]))
  const map = new Map<string, 'error' | 'warning'>()
  for (const issue of issues) {
    if (!issue.week_start_date || issue.row_id == null) continue
    const uid = uidBySource.get(issue.row_id)
    if (!uid) continue
    const key = cellKey(issue.week_start_date, uid)
    if (map.get(key) === 'error') continue
    map.set(key, issue.severity === 'error' ? 'error' : 'warning')
  }
  return map
}

export interface ShiftTypeLite {
  id: number
  name: string
}

/**
 * 套用預覽列的「目前 → 輪值表」班別名稱（Final fix FE-1）。id 為 null（create
 * 無目前 / removed 無輪值表）顯示「（無）」；清單裡查不到（含已停用班別，呼叫端
 * 應傳完整清單而非 activeShiftTypes）顯示 `#id` 而非直接消失。
 */
export function shiftTypeLabel(shiftTypes: ShiftTypeLite[], id: number | null): string {
  if (id == null) return '（無）'
  return shiftTypes.find((t) => t.id === id)?.name ?? `#${id}`
}

/** 本機「本週一」日期（local-noon 慣例避免 DST/時區把日期推前一天；不可用 toISOString）。 */
export function thisWeekMonday(now: Date = new Date()): string {
  const d = new Date(now)
  d.setHours(12, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return toIso(d)
}

export function summarizeChanges(changes: ApplyChange[]) {
  const out = { create: 0, update: 0, removed: 0, unchanged: 0, manual: 0, finalized: 0, recorded: 0 }
  for (const c of changes) {
    if (c.action === 'skip') {
      if (c.skip_reason === 'manual') out.manual += 1
      else if (c.skip_reason === 'finalized') out.finalized += 1
      else if (c.skip_reason === 'recorded') out.recorded += 1
    } else if (c.action in out) {
      out[c.action as 'create' | 'update' | 'removed' | 'unchanged'] += 1
    }
  }
  return out
}

export interface ChangeWeekGroup {
  week: string
  items: ApplyChange[]
}

/**
 * 依週分組供套用預覽列出，只含「真正的變動」：unchanged 排除；已封存／已有打卡
 * 略過列另有彙總計數區塊呈現（Final fix FE-1，避免上百筆淹沒真正變動），這裡
 * 不逐筆列出；手動略過列仍逐筆列出（需要保留 checkbox 讓行政勾選覆寫）。
 */
export function groupChangesByWeek(changes: ApplyChange[]): ChangeWeekGroup[] {
  const map = new Map<string, ApplyChange[]>()
  for (const c of changes) {
    if (c.action === 'unchanged') continue
    if (c.action === 'skip' && (c.skip_reason === 'finalized' || c.skip_reason === 'recorded')) continue
    const list = map.get(c.week_start_date) ?? []
    list.push(c)
    map.set(c.week_start_date, list)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, items]) => ({ week, items }))
}

/** 依「本週一」把週分組拆成本週以前／本週及以後兩批（Final fix FE-1）。 */
export function partitionWeekGroups(
  groups: ChangeWeekGroup[],
  todayMonday: string
): { past: ChangeWeekGroup[]; upcoming: ChangeWeekGroup[] } {
  return {
    past: groups.filter((g) => g.week < todayMonday),
    upcoming: groups.filter((g) => g.week >= todayMonday),
  }
}

export function countChangesInGroups(groups: ChangeWeekGroup[]): number {
  return groups.reduce((sum, g) => sum + g.items.length, 0)
}

export function snapshotKey(s: EditableState): string {
  return JSON.stringify({
    ...s,
    rows: s.rows.map(({ uid, ...rest }) => ({ ...rest, uid: uid.startsWith('r') ? uid : 'new' })),
    cells: Object.entries(s.cells).sort(([a], [b]) => a.localeCompare(b)),
  })
}

export function classroomLabel(c: RotationClassroom): string {
  return c.class_code ? `${c.class_code} ${c.name}` : c.name
}

export function isNotFound(e: unknown): boolean {
  return (e as { response?: { status?: number } } | null)?.response?.status === 404
}
