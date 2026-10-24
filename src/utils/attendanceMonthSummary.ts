/**
 * 排班與出勤「月摘要」：整月所有計數與封存狀態的唯一來源。
 *
 * 進度列、頁首主要動作、匯出提醒都吃這一份，不各自重算「待處理」——
 * 以前三處各算各的，封存月還顯示 169＋266 件待處理。本檔只從整月格子資料算數字，不呼叫 API。
 */
import { patternCellKeys, patternIssueTotal, type AttendancePattern } from '@/utils/attendancePatterns'
import {
  addDaysISO,
  cellKey,
  importProgress,
  isIssue,
  isSealed,
  isSealedLeftover,
  uncoveredDates,
  type GridOut,
  type ImportProgress,
} from '@/utils/scheduleAttendanceGrid'

/** 月份的封存狀態：在職者全部封存＝sealed、部分＝partial、都沒有＝open */
export type SealState = 'open' | 'partial' | 'sealed'
/**
 * 結算的步驟（目前輪到哪一步）；done＝整月已封存，沒有下一步；
 * waiting＝月份還沒結束、前面都做完了：只能等月底再匯入、再交薪資（沒有行政能按的動作，進度列落在步驟 1）。
 */
export type MonthStep = 'import' | 'patterns' | 'daily' | 'confirm' | 'payroll' | 'waiting' | 'done'

export interface MonthSummary {
  year: number
  month: number
  sealState: SealState
  sealedEmployeeIds: ReadonlySet<number>
  /** 當月至少一天在職的人數 */
  employedCount: number
  importStatus: ImportProgress
  /** 設定問題人數（只算未封存者） */
  patternPeople: number
  /** 設定修好可清掉的件數 */
  patternIssueCount: number
  /** 逐日待辦件數（一人一天＝1 件；排除型態格、排除封存） */
  dailyIssueCount: number
  /** 封存者在封存時沒處理的件數（只能稽核） */
  leftoverCount: number
  /** 這個月已經過完（今天晚於該月最後一天）。沒過完時還有天數沒發生，打卡匯入不完整、也還不能交薪資 */
  monthEnded: boolean
  /** 「已匯入至 X」要寫的日子：已涵蓋的最後一個工作日；一個工作日都沒涵蓋就用昨天 */
  importedThrough: string
}

/**
 * `today` 是核對待辦用的「今天」（通常是 data.today）；patterns 是同一份 data 的
 * detectAttendancePatterns 結果（沒有出勤讀取權限時傳 []）。
 */
export function buildMonthSummary(data: GridOut, patterns: AttendancePattern[], today: string): MonthSummary {
  const employed = new Set<number>()
  const sealedAny = new Set<number>()
  for (const cell of data.cells) {
    if (cell.employed) employed.add(cell.employee_id)
    if (isSealed(cell)) sealedAny.add(cell.employee_id)
  }
  // 封存是「在職日」才有的狀態（不在職日後端回 not_employed）；只認有在職日的人，才不會出現 sealed 人數大於在職人數
  const sealedEmployeeIds = new Set([...sealedAny].filter((id) => employed.has(id)))
  const sealState: SealState =
    sealedEmployeeIds.size === 0 ? 'open' : sealedEmployeeIds.size >= employed.size ? 'sealed' : 'partial'

  const coveredWorkdays = data.days.filter((d) => d.is_workday && d.import_covered === true)
  const unsealedPatterns = patterns.filter((p) => !sealedEmployeeIds.has(p.employeeId))
  const patternKeys = patternCellKeys(unsealedPatterns)
  const uncovered = uncoveredDates(data.days)
  let dailyIssueCount = 0
  let leftoverCount = 0
  for (const cell of data.cells) {
    // isIssue 與 isSealedLeftover 互斥（封存與否），一格最多落在其中一邊
    if (isIssue(cell, today, uncovered)) {
      if (!patternKeys.has(cellKey(cell.employee_id, cell.date))) dailyIssueCount += 1
    } else if (isSealedLeftover(cell, today, uncovered)) {
      leftoverCount += 1
    }
  }

  return {
    year: Number(data.start_date.slice(0, 4)),
    month: Number(data.start_date.slice(5, 7)),
    sealState,
    sealedEmployeeIds,
    employedCount: employed.size,
    importStatus: importProgress(data.days, data.today),
    patternPeople: unsealedPatterns.length,
    patternIssueCount: patternIssueTotal(unsealedPatterns),
    dailyIssueCount,
    leftoverCount,
    // 月份字串（YYYY-MM）比較＝今天晚於該月最後一天；today 是台北日期（data.today）
    monthEnded: today.slice(0, 7) > data.start_date.slice(0, 7),
    importedThrough: coveredWorkdays.length ? coveredWorkdays[coveredWorkdays.length - 1].date : addDaysISO(today, -1),
  }
}

/**
 * 目前輪到哪一步：封存＝done；一天都沒匯入或有缺漏工作日＝import；
 * 之後依序 設定問題 → 逐日待辦 → 老師確認（confirmOutstanding＝還沒回覆的人數）→ 交薪資。
 * 月份還沒結束時走到最後一步不是交薪資而是 waiting（等月底）；已有進行中的輪次（還有人沒回覆）照樣停在 confirm。
 */
export function currentStep(s: MonthSummary, confirmOutstanding: number): MonthStep {
  if (s.sealState === 'sealed') return 'done'
  if (s.importStatus.lastCovered === null || s.importStatus.missingWorkdays.length > 0) return 'import'
  if (s.patternPeople > 0) return 'patterns'
  if (s.dailyIssueCount > 0) return 'daily'
  if (confirmOutstanding > 0) return 'confirm'
  return s.monthEnded ? 'payroll' : 'waiting'
}

/**
 * 目前步驟的主要動作文字（頁首主要按鈕與手機膠囊共用）。
 * confirm（等老師回覆）、waiting（等月底）與 done 沒有行政能按的動作，回 null。
 */
export function primaryLabel(s: MonthSummary, step: MonthStep): string | null {
  switch (step) {
    case 'import':
      return '匯入打卡'
    case 'patterns':
      return `先修設定問題・${s.patternPeople} 人`
    case 'daily':
      return `處理待辦・剩 ${s.dailyIssueCount} 件`
    case 'payroll':
      return '交薪資'
    default:
      return null
  }
}

/** 頁首主要按鈕與手機膠囊能觸發的動作 */
export type PrimaryAction = 'import' | 'patterns' | 'daily' | 'payroll'
export interface PrimaryActionSpec {
  label: string
  action: PrimaryAction
}

/**
 * 目前步驟要按的那個動作（頁首主要按鈕與手機膠囊共用，兩處規則一致）。
 * 沒有行政能按的（等老師回覆、等月底、已封存、還在載入）或沒有權限（匯入要出勤寫入、交薪資要薪資讀取）＝null。
 */
export function primaryAction(
  s: MonthSummary,
  step: MonthStep | null,
  can: { writeAttendance: boolean; viewSalary: boolean },
): PrimaryActionSpec | null {
  if (!step) return null
  const label = primaryLabel(s, step)
  if (label === null) return null
  switch (step) {
    case 'import':
      return can.writeAttendance ? { label, action: 'import' } : null
    case 'patterns':
      return { label, action: 'patterns' }
    case 'daily':
      return { label, action: 'daily' }
    case 'payroll':
      return can.viewSalary ? { label, action: 'payroll' } : null
    default:
      return null
  }
}
