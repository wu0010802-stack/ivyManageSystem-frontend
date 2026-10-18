/**
 * 本月型態診斷：從整月格子找出「一整個月都是同一種情形」的人。
 *
 * 實測 115 年 9 月：470 格待處理裡約六成來自少數幾個人：整月沒有打卡（多半是卡號沒對照）、
 * 每天固定遲到早退（多半是應上班時段或員工類型設錯）。這些不是逐日要處理的異常，修好設定
 * 才會一次消失；混在逐日清單裡只會讓人逐格豁免。本檔只判斷型態，不改任何資料。
 */
import { isIssue, uncoveredDates, type GridCell, type GridOut } from '@/utils/scheduleAttendanceGrid'

/** 至少這麼多個應上班日才下判斷（月初、剛到職的人資料太少） */
const MIN_EXPECTED_DAYS = 3
/** 有打卡的天數不超過應上班日的這個比例，才算「幾乎沒有打卡」 */
const NO_PUNCH_MAX_RATIO = 0.1
/** 兩邊都有打卡的日子至少這麼多天，才判斷固定偏移 */
const MIN_BOTH_PUNCHED_DAYS = 5
/** 遲到／早退至少這麼多分鐘才算一次偏移（幾分鐘的誤差不是設定問題） */
const OFFSET_MINUTES = 10
/** 偏移天數占兩邊都有打卡日子的比例 */
const OFFSET_MIN_RATIO = 0.6
/**
 * 偏移分鐘數的四分位距上限：固定在某個時刻才像時段設錯，時間分散是真的常遲到。
 * 依偏移大小放寬（中位數的 15%）：半天班每天早退 5 小時、離開時刻前後差 40 分鐘仍是同一個型態。
 */
const OFFSET_MAX_IQR = 15
const OFFSET_IQR_RATIO = 0.15

interface PatternBase {
  employeeId: number
  name: string
  roleLabel: string | null
  /** 這個人本月的待處理格數（與本月進度、只看待處理同一個定義） */
  issueCount: number
  /** 其中符合這個型態的待處理格數（設定修好會一起消失的那幾格） */
  matchCount: number
  /** 納入判斷的應上班日：過去、當天有匯入、非全天假、在職 */
  expectedDays: number
  /** 有任一打卡的天數 */
  punchedDays: number
  /** 第一個納入判斷的日子（看他整月時聚焦用） */
  firstDate: string
}

export interface NoPunchPattern extends PatternBase {
  kind: 'no_punches'
  /** 這些天全是資料待補：匯入的打卡檔裡沒有這個人（多半是卡號沒對照） */
  notInImport: boolean
}

export interface FixedOffsetPattern extends PatternBase {
  kind: 'fixed_offset'
  /** 上下班都有打卡的天數（比例的分母） */
  bothDays: number
  lateDays: number
  earlyDays: number
  /** 遲到日的分鐘數中位數；沒有成型＝null */
  typicalLate: number | null
  typicalEarly: number | null
  /** 實際上下班打卡時刻的中位數（HH:MM） */
  typicalIn: string | null
  typicalOut: string | null
  /** 系統認定的應上班時段（出現最多次的那個） */
  planWindow: string | null
}

export type AttendancePattern = NoPunchPattern | FixedOffsetPattern

/** 四分位距（Q3－Q1，取最接近的實際值） */
function iqr(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) * 0.75)] - sorted[Math.floor((sorted.length - 1) * 0.25)]
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

/** HH:MM 字串的中位數（同格式字串可直接比大小） */
function medianTime(values: readonly string[]): string | null {
  if (!values.length) return null
  const sorted = [...values].sort()
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>()
  let best: string | null = null
  for (const value of values) {
    const n = (counts.get(value) ?? 0) + 1
    counts.set(value, n)
    if (best === null || n > (counts.get(best) ?? 0)) best = value
  }
  return best
}

const hhmm = (iso: string): string => iso.slice(11, 16)

/** 納入判斷的應上班日 */
function isConsidered(cell: GridCell, today: string, uncovered: ReadonlySet<string>): boolean {
  if (!cell.employed || !cell.actual || cell.date >= today) return false
  if (!cell.plan.expected || cell.plan.day_off) return false
  if (uncovered.has(cell.date)) return false
  if (cell.actual.status === 'leave') return false
  return !cell.leaves.some((leave) => leave.status === 'approved' && leave.is_full_day)
}

export function detectAttendancePatterns(grid: GridOut): AttendancePattern[] {
  const uncovered = uncoveredDates(grid.days)
  const byEmployee = new Map<number, GridCell[]>()
  for (const cell of grid.cells) {
    const list = byEmployee.get(cell.employee_id)
    if (list) list.push(cell)
    else byEmployee.set(cell.employee_id, [cell])
  }

  const patterns: AttendancePattern[] = []
  for (const emp of grid.employees) {
    const cells = (byEmployee.get(emp.employee_id) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))
    const issue = (c: GridCell) => isIssue(c, grid.today, uncovered)
    const issueCount = cells.filter(issue).length
    if (issueCount === 0) continue
    const considered = cells.filter((c) => isConsidered(c, grid.today, uncovered))
    if (considered.length < MIN_EXPECTED_DAYS) continue

    const base: Omit<PatternBase, 'matchCount'> = {
      employeeId: emp.employee_id,
      name: emp.name,
      roleLabel: emp.role_label ?? null,
      issueCount,
      expectedDays: considered.length,
      punchedDays: considered.filter((c) => c.actual!.punch_in || c.actual!.punch_out).length,
      firstDate: considered[0].date,
    }

    if (base.punchedDays <= Math.floor(considered.length * NO_PUNCH_MAX_RATIO)) {
      const unpunched = considered.filter((c) => !c.actual!.punch_in && !c.actual!.punch_out)
      patterns.push({
        ...base,
        kind: 'no_punches',
        matchCount: unpunched.filter(issue).length,
        notInImport: unpunched.every((c) => c.actual!.status === 'data_incomplete'),
      })
      continue
    }

    const both = considered.filter((c) => c.actual!.punch_in && c.actual!.punch_out)
    if (both.length < MIN_BOTH_PUNCHED_DAYS) continue
    const lates = both.map((c) => c.actual!.late_minutes).filter((m) => m >= OFFSET_MINUTES)
    const earlies = both.map((c) => c.actual!.early_leave_minutes).filter((m) => m >= OFFSET_MINUTES)
    const concentrated = (values: number[]) => iqr(values) <= Math.max(OFFSET_MAX_IQR, (median(values) ?? 0) * OFFSET_IQR_RATIO)
    const lateShaped = lates.length / both.length >= OFFSET_MIN_RATIO && concentrated(lates)
    const earlyShaped = earlies.length / both.length >= OFFSET_MIN_RATIO && concentrated(earlies)
    if (!lateShaped && !earlyShaped) continue
    const shaped = (c: GridCell) =>
      (lateShaped && c.actual!.late_minutes >= OFFSET_MINUTES) || (earlyShaped && c.actual!.early_leave_minutes >= OFFSET_MINUTES)
    patterns.push({
      ...base,
      kind: 'fixed_offset',
      matchCount: both.filter((c) => shaped(c) && issue(c)).length,
      bothDays: both.length,
      lateDays: lateShaped ? lates.length : 0,
      earlyDays: earlyShaped ? earlies.length : 0,
      typicalLate: lateShaped ? median(lates) : null,
      typicalEarly: earlyShaped ? median(earlies) : null,
      typicalIn: medianTime(both.map((c) => hhmm(c.actual!.punch_in!))),
      typicalOut: medianTime(both.map((c) => hhmm(c.actual!.punch_out!))),
      planWindow: mostCommon(considered.map((c) => `${c.plan.work_start}–${c.plan.work_end}`)),
    })
  }

  const rank = (p: AttendancePattern): number => (p.kind === 'no_punches' ? 0 : 1)
  return patterns.sort((a, b) => rank(a) - rank(b) || b.issueCount - a.issueCount || a.name.localeCompare(b.name, 'zh-Hant'))
}

/** 這些型態合計占了本月多少格待處理（只算符合型態的那幾格） */
export function patternIssueTotal(patterns: readonly AttendancePattern[]): number {
  return patterns.reduce((sum, p) => sum + p.matchCount, 0)
}

/** 格子人員欄的短註記（滑鼠移上去看 patternSummary） */
export function patternTag(pattern: AttendancePattern): string {
  return pattern.kind === 'no_punches' ? '本月沒有打卡' : '時段可能設錯'
}

/** 一句話描述型態（格子註記的 title、報讀用） */
export function patternSummary(pattern: AttendancePattern): string {
  if (pattern.kind === 'no_punches') {
    return pattern.punchedDays === 0
      ? `本月 ${pattern.expectedDays} 個應上班日都沒有打卡${pattern.notInImport ? '（匯入的打卡檔裡沒有這位員工）' : ''}`
      : `本月 ${pattern.expectedDays} 個應上班日只有 ${pattern.punchedDays} 天有打卡`
  }
  const parts = [
    pattern.lateDays ? `${pattern.lateDays} 天遲到（多為 ${pattern.typicalLate} 分）` : '',
    pattern.earlyDays ? `${pattern.earlyDays} 天早退（多為 ${pattern.typicalEarly} 分）` : '',
  ].filter(Boolean)
  return `上下班都有打卡的 ${pattern.bothDays} 天中，${parts.join('、')}`
}
