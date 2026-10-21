/**
 * 出勤明細借用「班表核對」的判定（第五輪審查 P1：同一人日兩個頁籤兩套判定）。
 *
 * 出勤明細的狀態來自出勤紀錄（遲到 24 分鐘），班表核對的判定來自班表 vs 打卡（疑似換班）。
 * 兩者都對，但只看前者會在其實是換班的那天接受遲到扣款。頁面用整月格子（本月進度那一份）
 * 提供查詢，出勤明細的整月表與處理卡片注入後並列顯示，不另打 API。
 */
import { computed, inject, type ComputedRef, type InjectionKey } from 'vue'
import type { MonthGridState } from '@/composables/useMonthGrid'
import { patternAcceptWarning, patternCellKeys } from '@/utils/attendancePatterns'
import { cellDisplay, cellKey, uncoveredDates, type ReconStatus } from '@/utils/scheduleAttendanceGrid'

export interface GridVerdict {
  /** 格子上的判定文字（與班表核對同一句，例如「疑似換班」「遲到 57 分・早退 342 分」） */
  label: string
  status: ReconStatus
  /** 這格符合整月固定型態（多半是設定問題）時，接受扣款前的提醒；否則 null */
  acceptWarning: string | null
}

/** employeeId 為 null 時可改用員工編號（異常清單的日卡只有編號） */
export type GridVerdictLookup = (employeeId: number | null, date: string, employeeNumber?: string | null) => GridVerdict | null

/**
 * 出勤明細說不出來的判定：明細只看出勤紀錄（遲到／早退／缺卡），這幾種要看班表才知道。
 * 遲到早退、缺卡兩邊說的是同一件事，並列只是重複（「遲到 53 分」旁又寫「班表核對：遲到 53 分」）。
 */
const RECORDS_BLIND_STATUSES: ReadonlySet<ReconStatus> = new Set(['possible_shift_change', 'suspected_absence', 'data_incomplete', 'unscheduled_attendance'])
export function isRecordsBlind(status: ReconStatus): boolean {
  return RECORDS_BLIND_STATUSES.has(status)
}

export const GRID_VERDICT_KEY: InjectionKey<ComputedRef<GridVerdictLookup>> = Symbol('gridVerdict')

/** 頁面用整月格子建立查詢（月份不同或資料還沒到＝查不到，各元件照原本顯示） */
export function buildGridVerdictLookup(month: MonthGridState): ComputedRef<GridVerdictLookup> {
  return computed<GridVerdictLookup>(() => {
    const grid = month.data.value
    const cells = month.cells.value
    const patterns = month.patterns.value
    const patternKeys = patternCellKeys(patterns)
    const uncovered = grid ? uncoveredDates(grid.days) : new Set<string>()
    const idByNumber = new Map((grid?.employees ?? []).filter((e) => e.employee_number).map((e) => [e.employee_number!, e.employee_id]))
    return (employeeIdArg, date, employeeNumber) => {
      const employeeId = employeeIdArg ?? (employeeNumber ? idByNumber.get(employeeNumber) ?? null : null)
      if (!grid || employeeId == null) return null
      const cell = cells.get(cellKey(employeeId, date))
      if (!cell?.actual) return null
      const label = cellDisplay(cell, grid.today, uncovered).verdict?.label
      if (!label) return null
      const pattern = patternKeys.has(cellKey(employeeId, date)) ? patterns.find((p) => p.employeeId === employeeId) : undefined
      return { label, status: cell.actual.status, acceptWarning: pattern ? patternAcceptWarning(pattern) : null }
    }
  })
}

/** 子元件取用；沒有提供（單獨掛載、測試）時一律查不到 */
export function useGridVerdict(): ComputedRef<GridVerdictLookup> {
  return inject(GRID_VERDICT_KEY, computed<GridVerdictLookup>(() => () => null))
}
