/**
 * 排班與出勤格子（SPEC-027 §2、§4）的顯示與編輯拆分純函式。
 *
 * 資料來源是 GET /schedule-attendance/grid；本檔不呼叫 API，只把格子資料轉成
 * 畫面要的文字、篩選與「整週改班怎麼送」的計畫，供 ShiftGrid／PersonDayDrawer／
 * useScheduleGrid 共用並可單獨測試。
 */
import type { ApiResponse } from '@/api/_generated/typed'
import type { CoverageShiftType, DailyOverrideLike, LeaveContextItem } from '@/utils/scheduleCoverage'
import { dateToLocalISO } from '@/utils/format'

export type GridOut = ApiResponse<'/schedule-attendance/grid', 'get'>
export type GridCell = GridOut['cells'][number]
export type GridDay = GridOut['days'][number]
export type GridEmployee = GridOut['employees'][number]
export type GridGroup = GridOut['groups'][number]
export type GridShiftType = GridOut['shift_types'][number]
export type PlanSource = GridCell['plan']['source']
export type ReconStatus = NonNullable<GridCell['actual']>['status']
export type GridFilter = 'all' | 'issues' | 'future'

/** 來源標籤（§2.2）：格子上顯示單字，抽屜顯示全名。 */
export const SOURCE_TAGS: Record<PlanSource, { short: string; label: string }> = {
  rotation: { short: '輪', label: '輪值表' },
  weekly: { short: '週', label: '週排班' },
  daily: { short: '日', label: '每日調整' },
  swap: { short: '換', label: '換班' },
  daily_off: { short: '休', label: '排休' },
  employee: { short: '預', label: '員工預設工時' },
  default: { short: '預', label: '系統預設工時' },
}

/** 核對狀態中文（與原「打卡核對」清單相同）。 */
export const RECON_STATUS_LABELS: Record<ReconStatus, string> = {
  matched: '符合原班表',
  possible_shift_change: '疑似換班',
  missing_punch: '缺卡待確認',
  suspected_absence: '疑似缺勤',
  data_incomplete: '資料待補',
  leave: '已核准請假',
  off_day: '非應出勤日',
  unscheduled_attendance: '非原排班出勤',
  anomaly: '出勤異常',
}

export type Tone = 'info' | 'warning' | 'danger'

const STATUS_TONES: Record<ReconStatus, Tone> = {
  matched: 'info',
  off_day: 'info',
  leave: 'info',
  data_incomplete: 'info',
  possible_shift_change: 'warning',
  unscheduled_attendance: 'warning',
  missing_punch: 'danger',
  suspected_absence: 'danger',
  anomaly: 'danger',
}

/** 「只看有問題」排除的判定（§2.1）。 */
const NON_ISSUE_STATUSES: ReadonlySet<ReconStatus> = new Set(['matched', 'off_day', 'leave'])
/** 仍在處理中的老師確認項目（SPEC-026 ACTIVE_ITEM_STATUSES）。 */
const ACTIVE_CONFIRMATION_STATUSES: ReadonlySet<string> = new Set(['pending', 'agreed', 'disputed'])

export const LOCKED_REASON_LABELS: Record<NonNullable<GridCell['edit']['locked_reason']>, string> = {
  recorded: '已有出勤紀錄：改班請用「確認當日班別」',
  finalized: '該月薪資已封存，不可修改',
  self: '本人的出勤不可自行確認',
  not_employed: '不在職期間',
  no_permission: '沒有修改權限',
}

export const cellKey = (employeeId: number, date: string): string => `${employeeId}|${date}`

export function indexCells(cells: readonly GridCell[]): Map<string, GridCell> {
  return new Map(cells.map((cell) => [cellKey(cell.employee_id, cell.date), cell]))
}

/** 'YYYY-MM-DD' 加減天數（以當地正午計算，避開日光節約與 UTC 位移）。 */
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00`)
  d.setDate(d.getDate() + days)
  return dateToLocalISO(d)
}

/** 該日所在週的週一。 */
export function mondayOf(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00`)
  const offset = (d.getDay() + 6) % 7
  return addDaysISO(dateISO, -offset)
}

export function monthRange(dateISO: string): { start: string; end: string } {
  const [y, m] = dateISO.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` }
}

const NO_DATES: ReadonlySet<string> = new Set()

/**
 * 整天都還沒匯入打卡的日子（`import_covered === false`；null＝沒有打卡權限，不算）。
 * 後端欄層級的 import_covered 是「這天至少一位員工被匯入涵蓋」。
 */
export function uncoveredDates(days: readonly GridDay[]): Set<string> {
  return new Set(days.filter((day) => day.import_covered === false).map((day) => day.date))
}

/**
 * 整天未匯入的「資料待補」：還不能核對，等匯入就好，不是要人決定的事。
 * 同一天只要有人被匯入，「資料待補」就仍算待處理——可能是這個人不在匯入檔裡、沒有有效班別、
 * 或假單組合無法自動判定（後端 attendance_reconciliation._row 的其他成因），都要人看。
 */
function isAwaitingImport(cell: GridCell, uncovered: ReadonlySet<string>): boolean {
  const actual = cell.actual
  return !!actual && actual.status === 'data_incomplete' && !actual.punch_in && !actual.punch_out && uncovered.has(cell.date)
}

export function isIssue(cell: GridCell, today: string, uncovered: ReadonlySet<string> = NO_DATES): boolean {
  if (cell.confirmation && ACTIVE_CONFIRMATION_STATUSES.has(cell.confirmation.status)) return true
  // 當日尚未結束不判（09-11 規則）；未來日沒有 actual
  if (!cell.actual || cell.date >= today) return false
  if (isAwaitingImport(cell, uncovered)) return false
  return !NON_ISSUE_STATUSES.has(cell.actual.status)
}

export interface ImportProgress {
  /** 最後一個有匯入的日子；一天都沒有＝null */
  lastCovered: string | null
  /** lastCovered 之前漏掉的工作日（「已匯入至 X」會掩蓋的缺口） */
  gaps: string[]
  /** 到昨天為止還沒匯入的工作日（含 lastCovered 之後） */
  missingWorkdays: string[]
}

export function importProgress(days: readonly GridDay[], today: string): ImportProgress {
  const covered = days.filter((day) => day.import_covered === true).map((day) => day.date)
  const lastCovered = covered.length ? covered[covered.length - 1] : null
  const missingWorkdays = days
    .filter((day) => day.is_workday && day.import_covered === false && day.date < today)
    .map((day) => day.date)
  const gaps = lastCovered ? missingWorkdays.filter((date) => date < lastCovered) : []
  return { lastCovered, gaps, missingWorkdays }
}

export function isFutureEditable(cell: GridCell, today: string): boolean {
  return cell.date > today && cell.edit.plan
}

export function rowMatchesFilter(
  cells: readonly GridCell[],
  filter: GridFilter,
  today: string,
  uncovered: ReadonlySet<string> = NO_DATES,
): boolean {
  if (filter === 'issues') return cells.some((cell) => isIssue(cell, today, uncovered))
  if (filter === 'future') return cells.some((cell) => isFutureEditable(cell, today))
  return true
}

/**
 * 週模式要顯示的欄：平日一律；週末只有在任何人有應出勤或有打卡時才出現（§2.1）。
 * `showAll`（可排班者）一律回傳全部：週排班的週末後端回 expected=false，否則週六活動／
 * 臨時加班要排人時沒有任何入口（舊每日調整對話框就是為此做成 7 天）。
 */
export function visibleDays(days: readonly GridDay[], cells: readonly GridCell[], showAll = false): GridDay[] {
  if (showAll) return [...days]
  const busyWeekend = new Set(
    cells
      .filter((cell) => cell.plan.expected || cell.actual?.punch_in || cell.actual?.punch_out)
      .map((cell) => cell.date),
  )
  return days.filter((day) => day.weekday < 5 || busyWeekend.has(day.date))
}

export function planText(cell: GridCell): string {
  const plan = cell.plan
  if (plan.day_off) return '排休'
  if (!plan.expected) return '非應出勤日'
  return `${plan.name ?? '預設工時'} ${plan.work_start}–${plan.work_end}`
}

const hhmm = (iso: string | null | undefined): string => (iso ? iso.slice(11, 16) : '—')

export interface CellDisplay {
  state: 'not_employed' | 'future' | 'working' | 'not_punched' | 'full_leave' | 'awaiting_import' | 'judged' | 'masked'
  plan: string
  source: { short: string; label: string }
  actual: string | null
  verdict: { label: string; tone: Tone } | null
  leaveTags: string[]
  locked: boolean
  /** 老師確認仍在處理中（待回覆／雙方已確認待套用／轉行政）時的提示，否則 null（§2.1 橘點） */
  confirmation: string | null
}

const CONFIRMATION_HINTS: Record<string, string> = {
  pending: '老師確認：待回覆',
  agreed: '老師確認：待套用',
  disputed: '老師確認：轉行政',
}

/** §2.2 格子狀態與顯示。 */
export function cellDisplay(cell: GridCell, today: string, uncovered: ReadonlySet<string> = NO_DATES): CellDisplay {
  const base = {
    plan: planText(cell),
    source: SOURCE_TAGS[cell.plan.source],
    leaveTags: cell.leaves.map((leave) => `${leave.leave_type_label}${leave.status === 'pending' ? '（待審）' : ''}`),
    locked: cell.edit.locked_reason === 'finalized',
    confirmation: cell.confirmation ? CONFIRMATION_HINTS[cell.confirmation.status] ?? null : null,
  }
  if (!cell.employed) return { ...base, state: 'not_employed', actual: null, verdict: null }
  if (cell.date > today) return { ...base, state: 'future', actual: null, verdict: null }
  const actual = cell.actual
  if (!actual) return { ...base, state: 'masked', actual: null, verdict: null }
  const punches = actual.punch_in || actual.punch_out ? `${hhmm(actual.punch_in)}–${hhmm(actual.punch_out)}` : null
  const fullLeave = cell.leaves.find((leave) => leave.status === 'approved' && leave.is_full_day)
  if (fullLeave && !punches) {
    return {
      ...base,
      state: 'full_leave',
      actual: null,
      verdict: { label: fullLeave.leave_type_label, tone: 'info' },
    }
  }
  if (cell.date < today && isAwaitingImport(cell, uncovered)) {
    return { ...base, state: 'awaiting_import', actual: null, verdict: { label: '未匯入', tone: 'info' } }
  }
  if (cell.date === today) {
    if (actual.punch_in && !actual.punch_out) {
      return { ...base, state: 'working', actual: punches, verdict: { label: '上班中', tone: 'info' } }
    }
    if (!actual.punch_in && !actual.punch_out) {
      return { ...base, state: 'not_punched', actual: null, verdict: { label: '尚未打卡', tone: 'info' } }
    }
  }
  return {
    ...base,
    state: 'judged',
    actual: punches,
    verdict: { label: RECON_STATUS_LABELS[actual.status], tone: STATUS_TONES[actual.status] },
  }
}

const DAILY_SOURCES: ReadonlySet<PlanSource> = new Set(['daily', 'daily_off', 'swap'])

export interface WeekChangePlan {
  /** 該週沒有任何已打卡日：直接送週排班。 */
  weekly: boolean
  /** 未打卡的工作日：改送每日調整。 */
  dailyDates: string[]
  /** 已打卡、可逐日確認的工作日：進批次確認。 */
  confirmDates: string[]
  /** 已打卡但無法確認（本人、封存、無權限或看不到核對版本）：保留原狀並提示。 */
  blockedDates: string[]
}

/**
 * 整週下拉改班的拆分（§4 第 3 列）。
 *
 * 只動「工作日且目前由週排班（或員工／系統預設）決定」的日子：已有每日調整、換班或排休的
 * 日子本來就不吃週排班，週末與假日改週排班也不會變成應出勤——若改送每日調整反而會把
 * 非應出勤日變成要上班，因此一律略過。
 */
export function planWeekChange(weekCells: readonly GridCell[], days: readonly GridDay[]): WeekChangePlan {
  const plan: WeekChangePlan = { weekly: false, dailyDates: [], confirmDates: [], blockedDates: [] }
  if (!weekCells.some((cell) => cell.edit.recorded)) {
    plan.weekly = true
    return plan
  }
  const workday = new Map(days.map((day) => [day.date, day.is_workday]))
  for (const cell of weekCells) {
    if (!workday.get(cell.date) || DAILY_SOURCES.has(cell.plan.source) || !cell.employed) continue
    if (cell.edit.recorded) {
      if (cell.edit.confirm && cell.actual?.version) plan.confirmDates.push(cell.date)
      else plan.blockedDates.push(cell.date)
    } else if (cell.edit.plan) {
      plan.dailyDates.push(cell.date)
    }
  }
  return plan
}

export interface BatchUnit {
  items: Array<{ employee_id: number; date: string; shift_type_id: number | null; day_off: boolean; version: string }>
}

export function confirmUnits(
  cells: ReadonlyMap<string, GridCell>,
  employeeId: number,
  dates: readonly string[],
  shiftTypeId: number | null,
): BatchUnit[] {
  return dates.flatMap((date) => {
    const version = cells.get(cellKey(employeeId, date))?.actual?.version
    if (!version) return []
    return [{
      items: [{ employee_id: employeeId, date, shift_type_id: shiftTypeId, day_off: shiftTypeId === null, version }],
    }]
  })
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * 「一併確認對調者」的配對（沿用原打卡核對清單的判斷）：同日另一人疑似換班、
 * 其原班別＝本人選的實際班別、且其候選含本人原班別，且只有唯一一位。
 */
export function findPairCell(
  target: GridCell,
  selectedShiftId: number | null,
  sameDay: readonly GridCell[],
): GridCell | null {
  const original = target.actual?.original_shift_type_id ?? null
  if (!target.actual || original === null || selectedShiftId === null || selectedShiftId === 0) return null
  const matches = sameDay.filter(
    (other) =>
      other.date === target.date &&
      other.employee_id !== target.employee_id &&
      other.actual?.status === 'possible_shift_change' &&
      other.actual.original_shift_type_id === selectedShiftId &&
      other.actual.candidates.some((candidate) => candidate.shift_type_id === original),
  )
  return matches.length === 1 ? matches[0] : null
}

/**
 * 把格子資料轉成 utils/scheduleCoverage.computeWeekCoverage 的輸入（欄頭空班警示）。
 *
 * `fromPlan`：沒有 SCHEDULE 權限的人不會載入週排班（weeklyShiftByEmp 全是 null），
 * 此時把來源為週排班／輪值表的格子也當成每日調整計入，結果等同有週排班時的算法。
 */
export function coverageInputs(
  grid: Pick<GridOut, 'cells' | 'employees' | 'shift_types'>,
  weeklyShiftByEmp: Record<number, number | null>,
  opts: { fromPlan?: boolean } = {},
): {
  employeeIds: number[]
  weeklyShiftByEmp: Record<number, number | null>
  dailyOverrides: DailyOverrideLike[]
  shiftTypes: CoverageShiftType[]
  leaves: LeaveContextItem[]
} {
  const names = new Map(grid.employees.map((e) => [e.employee_id, e.name]))
  const dailyOverrides: DailyOverrideLike[] = grid.cells
    .filter((cell) => DAILY_SOURCES.has(cell.plan.source))
    .map((cell) => ({
      employee_id: cell.employee_id,
      date: cell.date,
      shift_type_id: cell.plan.day_off ? null : cell.plan.shift_type_id ?? null,
    }))
  if (opts.fromPlan) {
    for (const cell of grid.cells) {
      if (cell.plan.source !== 'weekly' && cell.plan.source !== 'rotation') continue
      dailyOverrides.push({ employee_id: cell.employee_id, date: cell.date, shift_type_id: cell.plan.shift_type_id ?? null })
    }
  }
  const leaves: LeaveContextItem[] = grid.cells.flatMap((cell) =>
    cell.leaves.map((leave) => ({
      id: leave.leave_id,
      employee_id: cell.employee_id,
      employee_name: names.get(cell.employee_id) ?? '',
      leave_type: leave.leave_type_label,
      leave_type_label: leave.leave_type_label,
      start_date: cell.date,
      end_date: cell.date,
      start_time: leave.start_time ?? null,
      end_time: leave.end_time ?? null,
      status: leave.status,
    })),
  )
  return {
    employeeIds: grid.employees.map((e) => e.employee_id),
    weeklyShiftByEmp,
    dailyOverrides,
    shiftTypes: grid.shift_types.map((s) => ({
      id: s.shift_type_id,
      name: s.name,
      work_start: s.work_start,
      work_end: s.work_end,
    })),
    leaves,
  }
}

/** 後端「已有出勤紀錄」409（週排班與每日調整兩支守衛的訊息都含「出勤紀錄」）。 */
export function isRecordedConflict(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  const message = (err as { displayMessage?: string })?.displayMessage ?? ''
  return status === 409 && message.includes('出勤紀錄')
}
