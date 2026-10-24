/**
 * 排班與出勤格子（SPEC-027 §2、§4）的顯示與編輯拆分純函式。
 *
 * 資料來源是 GET /schedule-attendance/grid；本檔不呼叫 API，只把格子資料轉成
 * 畫面要的文字、篩選與「整週改班怎麼送」的計畫，供 ShiftGrid／PersonDayDrawer／
 * useScheduleGrid 共用並可單獨測試。
 */
import type { ApiResponse } from '@/api/_generated/typed'
import type { SealState } from '@/utils/attendanceMonthSummary'
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
/**
 * 列篩選（以「人」為單位，範圍是目前顯示的週或月）：
 * issues＝有待辦（至少一格待辦，且不是設定問題的格）；patterns＝設定問題（本月型態名單裡的人）；
 * leftover＝封存時未處理（至少一格封存前沒處理完的待辦）；future＝只看未來可排（排班用）。
 */
export type GridFilter = 'all' | 'issues' | 'patterns' | 'future' | 'leftover'
export type GridView = 'week' | 'month'
/** 格子面板的用途：核對（打卡、判定、待處理；週／月）或排班（只看計畫與假別、編週排班；只有週） */
export type GridMode = 'reconcile' | 'plan'

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

// tone 只分「判定本身有待處理含意」與「中性」（info）；格子上的顏色與形狀由 verdictKind 決定。
// 缺卡不扣款只記次數，與會扣款的遲到／早退／缺勤分開（danger 只留給會扣款的判定）。
const STATUS_TONES: Record<ReconStatus, Tone> = {
  matched: 'info',
  off_day: 'info',
  leave: 'info',
  data_incomplete: 'warning',
  possible_shift_change: 'warning',
  unscheduled_attendance: 'warning',
  missing_punch: 'warning',
  suspected_absence: 'danger',
  anomaly: 'danger',
}

/** 出勤明細已處理（ResolveCard／批次）的結果；處理後核對狀態不會變，要靠 confirmed_action 判斷 */
const CONFIRMED_ACTION_LABELS: Record<string, string> = { admin_accept: '已接受扣款', admin_waive: '已豁免' }

/**
 * 處理結果文字。只有缺卡、沒有遲到早退的日子不扣薪（後端明細「不扣款，僅記錄」），
 * 「接受」是記入缺卡次數，不能寫成「已接受扣款」。
 */
export function confirmedActionLabel(actual: Pick<NonNullable<GridCell['actual']>, 'confirmed_action' | 'status' | 'late_minutes' | 'early_leave_minutes'>): string {
  const action = actual.confirmed_action
  if (!action) return ''
  if (action === 'admin_accept' && actual.status === 'missing_punch' && !actual.late_minutes && !actual.early_leave_minutes) return '已確認缺卡'
  return CONFIRMED_ACTION_LABELS[action] ?? '已處理'
}

/**
 * 出勤明細已處理完。例外：疑似換班只「接受扣款」不算——異常清單只問遲到／缺卡，接受扣款沒有回答
 * 「是不是換了班」，仍要在格子確認當日班別；豁免＝不扣款，才算處理完。
 */
function isHandled(actual: NonNullable<GridCell['actual']>): boolean {
  if (!actual.confirmed_action) return false
  return !(actual.status === 'possible_shift_change' && actual.confirmed_action === 'admin_accept')
}

/** 「只看待處理」排除的判定（§2.1）。 */
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
  // 只算工作日：非工作日用每日調整排了人、當天卻沒人打卡時，這天永遠不會被匯入涵蓋，
  // 若也當成「等匯入」，那格就永遠不會出現在待處理
  return new Set(days.filter((day) => day.is_workday && day.import_covered === false).map((day) => day.date))
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

/** 該月薪資已封存（後端 grid.py 封存優先於已打卡）：改不了，也不再是待辦。 */
export function isSealed(cell: GridCell): boolean {
  return cell.edit?.locked_reason === 'finalized'
}

const hasActiveConfirmation = (cell: GridCell): boolean =>
  !!cell.confirmation && ACTIVE_CONFIRMATION_STATUSES.has(cell.confirmation.status)

/** 「若不看封存」這格是不是待辦：isIssue 與 isSealedLeftover 共用同一套規則，兩邊不會分叉。 */
function isIssueIgnoringSeal(cell: GridCell, today: string, uncovered: ReadonlySet<string>): boolean {
  if (hasActiveConfirmation(cell)) return true
  // 當日尚未結束不判（09-11 規則）；未來日沒有 actual
  if (!cell.actual || cell.date >= today) return false
  if (isAwaitingImport(cell, uncovered)) return false
  // 已在出勤明細接受扣款或豁免：後端核對是即時重算、不讀 confirmed_action，狀態仍是異常，但事情已處理完
  if (isHandled(cell.actual)) return false
  return !NON_ISSUE_STATUSES.has(cell.actual.status)
}

/** 待辦：封存格一律不算（點進去只會 409，留在待辦裡是要人做做不了的事）。 */
export function isIssue(cell: GridCell, today: string, uncovered: ReadonlySet<string> = NO_DATES): boolean {
  return !isSealed(cell) && isIssueIgnoringSeal(cell, today, uncovered)
}

/** 封存遺留：封存前沒處理完的待辦（只能稽核，不能再改）。 */
export function isSealedLeftover(cell: GridCell, today: string, uncovered: ReadonlySet<string> = NO_DATES): boolean {
  return isSealed(cell) && isIssueIgnoringSeal(cell, today, uncovered)
}

/** 格子狀態語意（形狀＋顏色五類）：週格子、月格子、圖例共用，順序即圖例順序。 */
export const VERDICT_KINDS = ['deduct', 'missing', 'confirm', 'setting', 'pending_data'] as const
export type VerdictKind = (typeof VERDICT_KINDS)[number]

export const VERDICT_KIND_LABELS: Record<VerdictKind, string> = {
  deduct: '會扣款',
  missing: '缺卡（不扣款，記次數）',
  confirm: '換班待確認',
  setting: '設定問題（先修設定）',
  pending_data: '資料待補',
}

/**
 * 這格的判定屬於哪一類（只看判定本身；是否還算待辦由 isIssue 決定，已處理／封存的呼叫端自己再判）。
 * 優先序：老師確認進行中或疑似換班／非原排班出勤 → confirm；整月同型態（pattern）且判定有待辦含意 → setting；
 * 異常／疑似缺勤 → deduct；缺卡 → missing；資料待補 → pending_data；其餘（符合、非應出勤日、請假、無打卡資料）null。
 */
export function verdictKind(cell: GridCell, opts: { pattern: boolean }): VerdictKind | null {
  const status = cell.actual?.status
  if (hasActiveConfirmation(cell) || status === 'possible_shift_change' || status === 'unscheduled_attendance') return 'confirm'
  if (!status) return null
  if (opts.pattern && !NON_ISSUE_STATUSES.has(status)) return 'setting'
  if (status === 'anomaly' || status === 'suspected_absence') return 'deduct'
  if (status === 'missing_punch') return 'missing'
  if (status === 'data_incomplete') return 'pending_data'
  return null
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

/** 列篩選要用的整月型態資料；沒給（舊呼叫端）時，issues 不排除型態格、patterns 沒有人 */
export interface RowFilterContext {
  /** 符合本月型態的待處理格（cellKey）：這些格是設定問題，不單獨算這個人「有待辦」 */
  patternKeys?: ReadonlySet<string>
  /** 本月被判成設定問題的人（員工 id） */
  patternEmployeeIds?: ReadonlySet<number>
}

export function rowMatchesFilter(
  cells: readonly GridCell[],
  filter: GridFilter,
  today: string,
  uncovered: ReadonlySet<string> = NO_DATES,
  context: RowFilterContext = {},
): boolean {
  switch (filter) {
    case 'issues': {
      const patternKeys = context.patternKeys
      return cells.some((cell) => isIssue(cell, today, uncovered) && !patternKeys?.has(cellKey(cell.employee_id, cell.date)))
    }
    case 'patterns': {
      const ids = context.patternEmployeeIds
      return !!ids && cells.some((cell) => ids.has(cell.employee_id))
    }
    case 'leftover':
      return cells.some((cell) => isSealedLeftover(cell, today, uncovered))
    case 'future':
      return cells.some((cell) => isFutureEditable(cell, today))
    default:
      return true
  }
}

/**
 * 目前這個情境提供哪些篩選選項（工具列的按鈕與「選到不存在的選項要退回全部」共用，兩邊不會分叉）。
 * 核對：全部、有待辦、設定問題；整月或部分員工已封存時多一個「封存時未處理」；整月都封存時沒有待辦可做，
 * 只留全部與封存時未處理。排班：全部、只看未來可排。
 * `sealState` 還沒載到（undefined）時當作未封存，但目前已選封存時未處理就先留著，否則網址帶 `filter=leftover`
 * 開頁會在月摘要載入前被洗掉。
 */
export function availableFilters(mode: GridMode, sealState: SealState | undefined, current?: GridFilter): GridFilter[] {
  if (mode === 'plan') return ['all', 'future']
  const state = sealState ?? 'open'
  const filters: GridFilter[] = ['all']
  if (state !== 'sealed') filters.push('issues', 'patterns')
  if (state !== 'open' || (sealState === undefined && current === 'leftover')) filters.push('leftover')
  return filters
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

/** 該日期所在月份往前／後 months 個月的月初（YYYY-MM-01） */
export function shiftMonthISO(dateISO: string, months: number): string {
  const [y, m] = dateISO.split('-').map(Number)
  const index = y * 12 + (m - 1) + months
  const year = Math.floor(index / 12)
  const month = index - year * 12 + 1
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export interface MonthWeek {
  /** 該週真正的週一（跨月週可能落在上個月）：點週次欄頭切週模式用它 */
  monday: string
  days: GridDay[]
}

/** 月格子週次欄頭：依週一分組，保留傳入順序（跨月週只含當月的日子） */
export function groupDaysByWeek(days: readonly GridDay[]): MonthWeek[] {
  const weeks: MonthWeek[] = []
  for (const day of days) {
    const monday = mondayOf(day.date)
    const last = weeks.length ? weeks[weeks.length - 1] : null
    if (last && last.monday === monday) last.days.push(day)
    else weeks.push({ monday, days: [day] })
  }
  return weeks
}

/** `leftover`＝封存時沒處理的格子：中性灰的點，不是任何一類待辦（封存格不可呈現成待處理），只讓「封存時未處理」篩選看得出是哪天 */
export type MonthDot = VerdictKind | 'leave' | 'leftover'

/** 月格子圖例裡「封存時未處理」那項的文字 */
export const LEFTOVER_DOT_LABEL = '封存時未處理（只能看）'

/**
 * 月格子狀態點（SPEC-027 §2 月模式）。判定類別只給「待處理」（與 isIssue、只看待處理同一定義，D14；封存格不算）：
 * 回傳 verdictKind（會扣款／缺卡／換班待確認／設定問題／資料待補）。`opts.pattern`＝這格符合本月型態（整月同型態）。
 * 封存時沒處理的格子（isSealedLeftover）＝leftover（中性，順位同待辦點、在請假之前）。
 * 不是待處理但當天有假（含待審、含未來日）＝leave；其餘不畫點。
 */
export function monthDot(
  cell: GridCell,
  today: string,
  uncovered: ReadonlySet<string> = NO_DATES,
  opts: { pattern?: boolean } = {},
): MonthDot | null {
  if (!cell.employed) return null
  if (isIssue(cell, today, uncovered)) {
    const kind = verdictKind(cell, { pattern: opts.pattern ?? false })
    if (kind) return kind
  }
  if (isSealedLeftover(cell, today, uncovered)) return 'leftover'
  return cell.leaves.length > 0 ? 'leave' : null
}

/**
 * 手機沒有月格子，橫幅「看這 N 件」是整月的數字：目前這週沒有符合的格子就回整月最早那格的日期（頁面把錨點移過去），
 * 目前這週已有（不用跳）或整月都沒有時回 null。issues 的目標格＝待辦且不是設定問題的格（與「有待辦」的列條件相同），
 * leftover 的目標格＝封存遺留。
 */
export function nextWeekWithMatch(input: {
  cells: readonly GridCell[]
  filter: 'issues' | 'leftover'
  today: string
  /** 目前顯示的那週的週一 */
  currentWeekStart: string
  uncovered?: ReadonlySet<string>
  patternKeys?: ReadonlySet<string>
}): string | null {
  const uncovered = input.uncovered ?? NO_DATES
  const weekEnd = addDaysISO(input.currentWeekStart, 6)
  let first: string | null = null
  for (const cell of input.cells) {
    const matches =
      input.filter === 'leftover'
        ? isSealedLeftover(cell, input.today, uncovered)
        : isIssue(cell, input.today, uncovered) && !input.patternKeys?.has(cellKey(cell.employee_id, cell.date))
    if (!matches) continue
    if (cell.date >= input.currentWeekStart && cell.date <= weekEnd) return null
    if (first === null || cell.date < first) first = cell.date
  }
  return first
}

/**
 * 月格子班別縮寫：全天已核准假＝「假」、排休＝「休」、非應出勤日空白、員工／系統預設工時＝「預」，
 * 其餘取班別名前兩個字（Array.from 以字為單位，不切壞中文）。
 */
export function monthCellText(cell: GridCell): string {
  if (!cell.employed) return ''
  if (cell.leaves.some((leave) => leave.status === 'approved' && leave.is_full_day)) return '假'
  const plan = cell.plan
  if (plan.day_off) return '休'
  if (!plan.expected) return ''
  if (plan.source === 'employee' || plan.source === 'default' || !plan.name) return '預'
  return Array.from(plan.name).slice(0, 2).join('')
}

export interface GridSection {
  group: GridGroup
  employees: GridEmployee[]
}

export interface GridSectionsInput extends RowFilterContext {
  groups: readonly GridGroup[]
  employees: readonly GridEmployee[]
  days: readonly GridDay[]
  cells: ReadonlyMap<string, GridCell>
  filter: GridFilter
  today: string
  keyword?: string
  uncovered?: ReadonlySet<string>
}

/** 列篩選（rowMatchesFilter）＋人員搜尋（姓名或工號，不分大小寫）＋依組分段；空組不出現。週、月格子與抽屜佇列共用。 */
export function gridSections(input: GridSectionsInput): GridSection[] {
  const needle = (input.keyword ?? '').trim().toLowerCase()
  const context: RowFilterContext = { patternKeys: input.patternKeys, patternEmployeeIds: input.patternEmployeeIds }
  const rows = input.employees.filter((emp) => {
    const cells = input.days
      .map((d) => input.cells.get(cellKey(emp.employee_id, d.date)))
      .filter((c): c is GridCell => c !== undefined)
    if (!rowMatchesFilter(cells, input.filter, input.today, input.uncovered ?? NO_DATES, context)) return false
    return !needle || emp.name.toLowerCase().includes(needle) || (emp.employee_number ?? '').toLowerCase().includes(needle)
  })
  return input.groups
    .map((group) => ({ group, employees: rows.filter((emp) => emp.group_key === group.key) }))
    .filter((section) => section.employees.length > 0)
}

/** 各篩選有幾個人（工具列按鈕上的數字） */
export interface FilterCounts {
  all: number
  issues: number
  patterns: number
  leftover: number
}

/**
 * 工具列各選項的人數：直接用 gridSections 數，和表格同一個範圍、同一套條件（數字與點進去看到的列數不會差），
 * 不受人員搜尋影響（搜尋是在篩選之上再縮小）。
 */
export function filterCounts(input: Omit<GridSectionsInput, 'filter' | 'keyword'>): FilterCounts {
  const count = (filter: GridFilter): number =>
    gridSections({ ...input, filter, keyword: '' }).reduce((total, section) => total + section.employees.length, 0)
  return { all: count('all'), issues: count('issues'), patterns: count('patterns'), leftover: count('leftover') }
}

export function planText(cell: GridCell): string {
  const plan = cell.plan
  if (plan.day_off) return '排休'
  if (!plan.expected) return '非應出勤日'
  return `${plan.name ?? '預設工時'} ${plan.work_start}–${plan.work_end}`
}

/**
 * 格子裡的計畫文字（比 planText 精簡，抽屜仍用 planText 全名）：
 * 員工／系統預設工時只寫時段——旁邊的「預」標籤已說明來源，兩邊都寫會讓格子在窄欄折成兩行。
 */
function cellPlanText(cell: GridCell): string {
  const plan = cell.plan
  if (plan.expected && !plan.day_off && (plan.source === 'employee' || plan.source === 'default')) {
    return `${plan.work_start}–${plan.work_end}`
  }
  return planText(cell)
}

const hhmm = (iso: string | null | undefined): string => (iso ? iso.slice(11, 16) : '缺')

export interface CellDisplay {
  state: 'not_employed' | 'future' | 'working' | 'not_punched' | 'full_leave' | 'awaiting_import' | 'judged' | 'masked'
  plan: string
  /** 非應出勤日（且不是排休）不掛來源標籤：哪一層決定「不用上班」對格子沒有意義 */
  source: { short: string; label: string } | null
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

/** 格子的假別標籤（待審的加註）；cellDisplay 在全天假時會把寫進判定的那張拿掉，排班格子沒有判定行，用全部 */
export function leaveTagLabels(cell: GridCell): string[] {
  return cell.leaves.map((leave) => `${leave.leave_type_label}${leave.status === 'pending' ? '（待審）' : ''}`)
}

/** §2.2 格子狀態與顯示。 */
export function cellDisplay(cell: GridCell, today: string, uncovered: ReadonlySet<string> = NO_DATES): CellDisplay {
  const base = {
    plan: cellPlanText(cell),
    source: !cell.plan.expected && !cell.plan.day_off ? null : SOURCE_TAGS[cell.plan.source],
    leaveTags: leaveTagLabels(cell),
    locked: isSealed(cell),
    confirmation: cell.confirmation ? CONFIRMATION_HINTS[cell.confirmation.status] ?? null : null,
  }
  if (!cell.employed) return { ...base, state: 'not_employed', actual: null, verdict: null }
  if (cell.date > today) return { ...base, state: 'future', actual: null, verdict: null }
  const actual = cell.actual
  if (!actual) return { ...base, state: 'masked', actual: null, verdict: null }
  const punches = actual.punch_in || actual.punch_out ? `${hhmm(actual.punch_in)}–${hhmm(actual.punch_out)}` : null
  // 今天只有上班卡＝還在上班，不是缺下班卡
  const openShift = actual.punch_in ? `${hhmm(actual.punch_in)} 起` : null
  const fullLeave = cell.leaves.find((leave) => leave.status === 'approved' && leave.is_full_day)
  if (fullLeave && !punches) {
    return {
      ...base,
      // 判定已寫假別，假別標籤不再重複同一張假（格子曾顯示「病假 病假」）
      leaveTags: base.leaveTags.filter((_, i) => cell.leaves[i] !== fullLeave),
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
      return { ...base, state: 'working', actual: openShift, verdict: { label: '上班中', tone: 'info' } }
    }
    // 今天不用上班（非應出勤日、排休）沒打卡是正常的，不寫「尚未打卡」
    if (!actual.punch_in && !actual.punch_out && cell.plan.expected && !cell.plan.day_off) {
      return { ...base, state: 'not_punched', actual: null, verdict: { label: '尚未打卡', tone: 'info' } }
    }
  }
  const handled = actual.confirmed_action && !NON_ISSUE_STATUSES.has(actual.status)
    ? confirmedActionLabel(actual)
    : null
  // 處理過的缺卡不再「待確認」：寫「缺卡・已確認」／「缺卡・已豁免」（「缺卡待確認・已確認缺卡」重複又矛盾）
  const missingHandled = !!handled && actual.status === 'missing_punch'
  const label = missingHandled ? '缺卡' : statusLabel(cell, actual)
  const handledText = missingHandled && handled === '已確認缺卡' ? '已確認' : handled
  return {
    ...base,
    state: 'judged',
    actual: punches,
    // 非應出勤日沒打卡：計畫行已寫「非應出勤日／排休」，判定再寫一次只是噪音
    verdict: actual.status === 'off_day'
      ? null
      : handled
        ? { label: `${label}・${handledText}`, tone: isHandled(actual) ? 'info' : STATUS_TONES[actual.status] }
        : { label, tone: STATUS_TONES[actual.status] },
  }
}

/**
 * 格子的判定文字。「出勤異常」就是遲到／早退，直接寫分鐘數（不用開抽屜才知道是遲到 5 分還是早退半天）；
 * 其他判定的分鐘數只是附帶資訊，留在抽屜。
 *
 * 判定是後端即時重算，分鐘數卻是出勤存檔值：改了班別時段或員工上下班時間、還沒重新匯入前兩者會分歧。
 * 存檔分鐘數和「打卡 vs 應上班時段」對不上時不寫數字，退回「出勤異常」，免得寫錯遲到幾分。
 * 當天有假時應上班時段會依假單調整，無法從格子推算，照存檔值寫。
 */
function statusLabel(cell: GridCell, actual: NonNullable<GridCell['actual']>): string {
  if (actual.status !== 'anomaly') return RECON_STATUS_LABELS[actual.status]
  if (!cell.leaves.length && !minutesConsistent(cell, actual)) return RECON_STATUS_LABELS.anomaly
  const parts = [
    actual.late_minutes ? `遲到 ${actual.late_minutes} 分` : '',
    actual.early_leave_minutes ? `早退 ${actual.early_leave_minutes} 分` : '',
  ].filter(Boolean)
  return parts.length ? parts.join('・') : RECON_STATUS_LABELS.anomaly
}

const clockMinutes = (hhmmText: string): number => {
  const [h, m] = hhmmText.split(':').map(Number)
  return h * 60 + m
}

/** 存檔的遲到／早退分鐘與「打卡時刻 vs 應上班時段」相差不超過 1 分（秒數取捨） */
function minutesConsistent(cell: GridCell, actual: NonNullable<GridCell['actual']>): boolean {
  const { work_start: start, work_end: end } = cell.plan
  if (actual.late_minutes) {
    if (!start || !actual.punch_in) return false
    if (Math.abs(clockMinutes(actual.punch_in.slice(11, 16)) - clockMinutes(start) - actual.late_minutes) > 1) return false
  }
  if (actual.early_leave_minutes) {
    if (!end || !actual.punch_out) return false
    if (Math.abs(clockMinutes(end) - clockMinutes(actual.punch_out.slice(11, 16)) - actual.early_leave_minutes) > 1) return false
  }
  return true
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

/**
 * 在格子上往下捲時先收起頁首：格子的捲動區高度是「工具列貼頂後」的可用高度，頁首還在畫面上時
 * 捲動區底部落在首屏外；若照瀏覽器預設先捲格子，最後幾列會一直被視窗切掉。工具列還沒貼頂
 * （toolbarOffset＝工具列頂端到外層捲動區頂端的距離）且外層還捲得動時，先捲外層，最多捲到貼頂。
 * 回傳外層要捲的量（px）；0＝交給格子自己捲。
 */
export function outerScrollFirst(m: { deltaY: number; toolbarOffset: number; outerRoom: number }): number {
  if (m.deltaY <= 0 || m.toolbarOffset <= 1 || m.outerRoom <= 0) return 0
  return Math.min(m.deltaY, m.toolbarOffset, m.outerRoom)
}
