/**
 * 才藝儀表板統計表的列組裝與達標／同比環比顯示（2026-10-19 業主裁定）。
 *
 * 達標一律改用**人次比率**（enrollment_ratio＝報名人次 ÷ 在籍）判定，
 * meets_target／shortfall_enrollments 由後端算好，前端只負責：
 * 1. 每個年級區塊內未達標班排前面（差越多越前），讓業主一眼看到要去推的班；
 * 2. 「差 N 人次」與同比（去年同學期）／環比（上一學期）的差值文字。
 * 參與率（ratio，不重複學生）僅供參考顯示，不參與判定。
 */
import type { Schema } from '@/api/_generated/typed'
import { denominatorCaption, type DenominatorKind } from '@/utils/headcountLabels'

export type DashboardTable = Schema<'ActivityDashboardTableOut'>
export type DashboardGrade = Schema<'ActivityDashboardGradeRowOut'>
export type DashboardClassroom = Schema<'ActivityDashboardClassroomRowOut'>
export type DashboardSubtotal = Schema<'ActivityDashboardGradeSubtotalOut'>
export type DashboardGrandTotal = Schema<'ActivityDashboardGrandTotalOut'>

export type DashboardRowType = 'class' | 'subtotal' | 'grand_total'

/** el-table 用的平面列：後端欄位原樣 spread，加上前端排版用欄位。 */
type BackendRowFields = Omit<
  Partial<DashboardClassroom> & Partial<DashboardSubtotal> & Partial<DashboardGrandTotal>,
  'bonus' | 'points'
>

export type DashboardTableRow = BackendRowFields & {
  rowType: DashboardRowType
  classroom_name: string
  teacher_name: string
  gradeName: string
  targetPercent?: number
  isFirstOfGrade: boolean
  rowSpan: number
  bonus: string
  points: string | number
}

type TargetFields = { meets_target?: boolean; shortfall_enrollments?: number }

/** 未達標判定：後端欄位缺漏（舊版回應）時視為未知、不標紅。 */
export function isBelowTarget(row: TargetFields): boolean {
  return row.meets_target === false
}

/**
 * 未達標班排前（差越多人次越前），達標班維持後端原順序。穩定排序、不改原陣列。
 */
export function sortClassroomsUnmetFirst<T extends TargetFields>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aBelow = isBelowTarget(a.row)
      const bBelow = isBelowTarget(b.row)
      if (aBelow !== bBelow) return aBelow ? -1 : 1
      if (aBelow && bBelow) {
        const diff = (b.row.shortfall_enrollments ?? 0) - (a.row.shortfall_enrollments ?? 0)
        if (diff !== 0) return diff
      }
      return a.index - b.index
    })
    .map(({ row }) => row)
}

/** 「差 N 人次」；達標、在籍 0（shortfall 0）或欄位缺漏時回空字串。 */
export function buildShortfallLabel(row: TargetFields): string {
  if (!isBelowTarget(row)) return ''
  const n = row.shortfall_enrollments ?? 0
  return n > 0 ? `差 ${n} 人次` : ''
}

export type TrendDirection = 'up' | 'down' | 'flat' | 'none'

export interface TrendLabel {
  direction: TrendDirection
  /** 箭頭＋差值（百分點），例：「↓8」；前期無資料為「—」 */
  text: string
}

/**
 * 人次比率與前期的差值（百分點）。previous 為 null／undefined（前期無同名班、
 * 前期在籍 0、舊版後端）一律顯示「—」。
 */
export function buildTrendLabel(
  current: number | null | undefined,
  previous: number | null | undefined,
): TrendLabel {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return { direction: 'none', text: '—' }
  }
  const delta = Math.round((current - previous) * 10) / 10
  if (delta > 0) return { direction: 'up', text: `↑${delta}` }
  if (delta < 0) return { direction: 'down', text: `↓${Math.abs(delta)}` }
  return { direction: 'flat', text: '持平' }
}

export interface BuildRowsOptions {
  /** 只看未達標：每年級只留未達標班＋小計，全部達標的年級整段收起 */
  onlyBelowTarget?: boolean
  bonusLabel: (bonus: number | undefined | null) => string
}

/**
 * 後端 grades > classrooms 樹狀結構展開成 el-table 平面列（各班列＋小計列，最後全園總計）。
 * rowSpan／isFirstOfGrade 給 objectSpanMethod 合併「獎金」「積分」欄。
 */
export function buildDashboardRows(
  table: Pick<DashboardTable, 'grades' | 'grand_total'>,
  { onlyBelowTarget = false, bonusLabel }: BuildRowsOptions,
): DashboardTableRow[] {
  const data: DashboardTableRow[] = []
  for (const grade of table.grades) {
    if (grade.classrooms.length === 0) continue
    const sorted = sortClassroomsUnmetFirst(grade.classrooms)
    const visible = onlyBelowTarget ? sorted.filter(isBelowTarget) : sorted
    if (onlyBelowTarget && visible.length === 0 && !isBelowTarget(grade.subtotal)) continue

    const rowSpan = visible.length + 1 // +1 給該年級的小計列
    const bonus = bonusLabel(grade.subtotal.bonus)
    const points = grade.subtotal.points || ''

    visible.forEach((cls, idx) => {
      data.push({
        ...cls,
        rowType: 'class',
        gradeName: grade.grade_name,
        targetPercent: cls.target_percent ?? grade.target_percent,
        isFirstOfGrade: idx === 0,
        rowSpan,
        bonus,
        points,
      })
    })

    data.push({
      ...grade.subtotal,
      rowType: 'subtotal',
      classroom_name: '小計',
      teacher_name: '',
      gradeName: grade.grade_name,
      targetPercent: grade.target_percent,
      // 該年級沒有可見班級時，小計自己就是合併欄的起點
      isFirstOfGrade: visible.length === 0,
      rowSpan: visible.length === 0 ? 1 : 0,
      bonus,
      points,
    })
  }

  data.push({
    ...table.grand_total,
    rowType: 'grand_total',
    classroom_name: '總計',
    teacher_name: '',
    gradeName: '',
    isFirstOfGrade: false,
    rowSpan: 1,
    bonus: '',
    points: '',
  })

  return data
}

type DenominatorBasis = Partial<Pick<
  DashboardTable,
  | 'denominator_kind'
  | 'denominator_basis_date'
  | 'denominator_provisional'
  | 'yoy_denominator_kind'
  | 'qoq_denominator_kind'
>>

export interface DenominatorLabels {
  /** 分母欄欄名：「註冊（9/15）」／「註冊（今天，暫估）」／「在籍」 */
  header: string
  /** 說明文字裡的分母名詞：「註冊人數」／「在籍人數」 */
  noun: string
  /** 同比／環比前期口徑與本期不同時的附註；同口徑為空字串 */
  priorBasisNote: string
}

/**
 * 分母口徑顯示（spec C10，2026-10-19）。後端欄位缺漏（舊版回應）一律視為在籍口徑。
 * 前期（上學期／去年同期）基準日早於 cutoff 時後端回 enrolled，比較跨了口徑要講明。
 */
export function buildDenominatorLabels(table: DenominatorBasis): DenominatorLabels {
  const kind: DenominatorKind = table.denominator_kind ?? 'enrolled'
  const differs: string[] = []
  if ((table.qoq_denominator_kind ?? 'enrolled') !== kind) differs.push('上學期')
  if ((table.yoy_denominator_kind ?? 'enrolled') !== kind) differs.push('去年同期')
  const priorNoun = kind === 'registered' ? '在籍人數' : '註冊人數'
  return {
    header: denominatorCaption(kind, table.denominator_basis_date, table.denominator_provisional ?? false),
    noun: kind === 'registered' ? '註冊人數' : '在籍人數',
    priorBasisNote: differs.length ? `${differs.join('、')}分母為${priorNoun}，與本期口徑不同` : '',
  }
}
