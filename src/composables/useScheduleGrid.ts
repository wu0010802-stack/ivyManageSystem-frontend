/**
 * 排班與出勤格子的資料與計畫編輯（SPEC-027 §4、§6.2）。
 *
 * - 載入：GET /schedule-attendance/grid（一週）＋有 SCHEDULE 時另取該週週排班（列首下拉的現值）。
 * - 編輯：列首「本週班別」下拉只改本地緩衝（weeklyEdits），按「儲存排班（N 處變更）」才送。
 * - 儲存：每位有變更的員工依 planWeekChange 拆分——整週未打卡送週排班（只送有變更的人，
 *   POST /shifts/assignments 是逐人 upsert、不影響清單外員工）；部分已打卡則未打卡工作日改送
 *   每日調整、已打卡日彙整成批次確認單位交給呼叫端開 BatchConfirmDialog。
 * - 後端「已打卡」409：重新載入格子後以最新 recorded 狀態重算一次拆分，不顯示原始錯誤。
 * - 儲存或複製途中換週：立即停止送出寫入，不清緩衝、不 reload，回報已取消。
 * - 只清除「成功處理」的員工緩衝；失敗者留在緩衝，重送是冪等的。
 */
import { computed, ref, watch, type Ref } from 'vue'
import { getScheduleAttendanceGrid } from '@/api/scheduleAttendance'
import { getAssignments, saveAssignments, saveDaily } from '@/api/shifts'
import type { ApiResponse } from '@/api/_generated/typed'
import {
  addDaysISO,
  cellKey,
  confirmUnits,
  indexCells,
  isRecordedConflict,
  planWeekChange,
  type BatchUnit,
  type GridCell,
  type GridOut,
} from '@/utils/scheduleAttendanceGrid'

type AssignmentRow = ApiResponse<'/shifts/assignments', 'get'>[number]
export type WeeklyWarning = NonNullable<ApiResponse<'/shifts/assignments', 'post'>['warnings']>[number]
type WeeklyItem = { employee_id: number; shift_type_id: number | null; notes: string | null }
type CellMap = ReturnType<typeof indexCells>

export interface SaveOutcome {
  /** 已直接寫入週排班的員工數 */
  weeklySaved: number
  /** 已寫入的每日調整筆數 */
  dailySaved: number
  /** 已打卡、要使用者在批次確認對話框確認的單位 */
  units: BatchUnit[]
  /** 已打卡但無法確認的人日（本人、封存、無權限、看不到版本、或要清除週排班） */
  blocked: Array<{ employeeId: number; dates: string[] }>
  /** 失敗訊息（每日調整個別失敗時收集，不中斷其他人） */
  errors: string[]
}

const CANCELLED_BY_WEEK_CHANGE = '儲存途中切換了週次，尚未送出的變更已取消'
const WEEK_NOT_LOADED = '本週資料尚未載入完成，請稍後再儲存'

const errorMessage = (err: unknown, fallback: string): string =>
  (err as { displayMessage?: string })?.displayMessage ?? fallback

function weekCellsOf(cellMap: CellMap, employeeId: number, dates: string[]): GridCell[] {
  return dates
    .map((date) => cellMap.get(cellKey(employeeId, date)))
    .filter((cell): cell is GridCell => cell !== undefined)
}

export function useScheduleGrid(weekStart: Ref<string>) {
  const grid = ref<GridOut | null>(null)
  const loading = ref(false)
  const loadError = ref<unknown>(null)
  const assignments = ref<Record<number, AssignmentRow>>({})
  const weeklyEdits = ref<Record<number, number | null>>({})
  const warnings = ref<WeeklyWarning[]>([])
  const saving = ref(false)
  let epoch = 0

  const cells = computed(() => indexCells(grid.value?.cells ?? []))
  const weekDates = computed(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart.value, i)))

  function currentWeekly(employeeId: number): number | null {
    return assignments.value[employeeId]?.shift_type_id ?? null
  }

  function weeklyValue(employeeId: number): number | null {
    return employeeId in weeklyEdits.value ? weeklyEdits.value[employeeId] : currentWeekly(employeeId)
  }

  const changedEmployeeIds = computed(() =>
    Object.keys(weeklyEdits.value)
      .map(Number)
      .filter((id) => weeklyEdits.value[id] !== currentWeekly(id)),
  )
  const pendingCount = computed(() => changedEmployeeIds.value.length)

  function setWeekly(employeeId: number, shiftTypeId: number | null): void {
    weeklyEdits.value = { ...weeklyEdits.value, [employeeId]: shiftTypeId }
  }

  function discardEdits(): void {
    weeklyEdits.value = {}
  }

  async function reload(): Promise<void> {
    const seq = ++epoch
    const start = weekStart.value
    loading.value = true
    loadError.value = null
    // 換週：先清掉上一週的格子與週排班，載入中或載入失敗時都不顯示、也不能操作舊週格子。
    // 同一週的重新載入（儲存後、revision 變動）不清，避免畫面閃空。
    if (grid.value && grid.value.start_date !== start) {
      grid.value = null
      assignments.value = {}
    }
    try {
      const res = await getScheduleAttendanceGrid({ start_date: start, end_date: addDaysISO(start, 6) })
      if (seq !== epoch) return
      // 格子與週排班兩支都回來才一起寫入；任一支失敗＝整次失敗，不留新週 grid 搭配舊週 assignments。
      let nextAssignments: Record<number, AssignmentRow> = {}
      if (res.data.caller.can_edit_plan) {
        const rows = (await getAssignments({ week_start: start })).data
        if (seq !== epoch) return
        nextAssignments = Object.fromEntries(rows.map((row) => [row.employee_id, row]))
      }
      grid.value = res.data
      assignments.value = nextAssignments
    } catch (err) {
      if (seq === epoch) loadError.value = err
    } finally {
      if (seq === epoch) loading.value = false
    }
  }

  watch(weekStart, () => {
    discardEdits()
    warnings.value = []
    void reload()
  })

  /**
   * 把來源週有週排班的人帶進本地緩衝（不寫後端）。只覆蓋來源週有列的人；來源週沒有排班的人
   * 保留本週原值，與舊頁「整份取代」不同（較安全，不會把沒列的人清空）。換週途中則不寫入。
   */
  async function copyFromWeek(sourceWeekStart: string): Promise<number> {
    const start = weekStart.value
    const rows = (await getAssignments({ week_start: sourceWeekStart })).data
    if (weekStart.value !== start) return 0
    const known = new Set((grid.value?.employees ?? []).map((e) => e.employee_id))
    const next = { ...weeklyEdits.value }
    let copied = 0
    for (const row of rows) {
      if (!known.has(row.employee_id)) continue
      next[row.employee_id] = row.shift_type_id ?? null
      copied += 1
    }
    weeklyEdits.value = next
    return copied
  }

  async function run(retried: boolean): Promise<SaveOutcome> {
    const outcome: SaveOutcome = { weeklySaved: 0, dailySaved: 0, units: [], blocked: [], errors: [] }
    if (!grid.value || saving.value) return outcome
    if (grid.value.start_date !== weekStart.value) {
      // 換週後新週格子還沒載入完成：用舊週格子判斷拆分會誤判成「整週未打卡」並帶入舊週備註。
      outcome.errors.push(WEEK_NOT_LOADED)
      return outcome
    }
    saving.value = true
    // 快照：之後的 await 期間若換週或使用者再改，本次儲存只處理開始時的內容。
    const start = weekStart.value
    const snapGrid = grid.value
    const snapCells = cells.value
    const snapDates = [...weekDates.value]
    const edits = { ...weeklyEdits.value }
    const ids = [...changedEmployeeIds.value]
    const weekChanged = () => weekStart.value !== start
    const cancelled = (): SaveOutcome => {
      outcome.errors.push(CANCELLED_BY_WEEK_CHANGE)
      return outcome
    }
    // 只刪「仍等於快照值」的緩衝項，避免把儲存期間使用者新改的值刪掉。
    const clearHandled = (handled: number[]) => {
      const next = { ...weeklyEdits.value }
      for (const id of handled) if (next[id] === edits[id]) delete next[id]
      weeklyEdits.value = next
    }
    const handled: number[] = []
    try {
      const weeklyItems: WeeklyItem[] = []
      for (const employeeId of ids) {
        const value = edits[employeeId]
        if (value === undefined) continue
        const plan = planWeekChange(weekCellsOf(snapCells, employeeId, snapDates), snapGrid.days)
        if (plan.weekly) {
          weeklyItems.push({
            employee_id: employeeId,
            shift_type_id: value,
            notes: assignments.value[employeeId]?.notes ?? null,
          })
          continue
        }
        let allSaved = true
        if (value === null) {
          // 「清除週排班＝回到預設工時」無法用每日調整表達（每日調整的空值是排休）。
          outcome.blocked.push({
            employeeId,
            dates: [...plan.dailyDates, ...plan.confirmDates, ...plan.blockedDates],
          })
        } else {
          for (const date of plan.dailyDates) {
            try {
              await saveDaily({ employee_id: employeeId, date, shift_type_id: value, day_off: false })
              outcome.dailySaved += 1
            } catch (err) {
              allSaved = false
              // 開頁後有人匯入打卡：後端原文指向已退場的「班表與打卡核對」，改顯示友善訊息；員工留在緩衝，重按儲存會重新拆分
              outcome.errors.push(
                isRecordedConflict(err)
                  ? `${date}：這天已有打卡紀錄，請重新整理後再儲存`
                  : `${date}：${errorMessage(err, '每日調整失敗')}`,
              )
            }
            if (weekChanged()) return cancelled()
          }
          outcome.units.push(...confirmUnits(snapCells, employeeId, plan.confirmDates, value))
          if (plan.blockedDates.length) outcome.blocked.push({ employeeId, dates: plan.blockedDates })
        }
        if (allSaved) handled.push(employeeId)
      }
      if (weeklyItems.length) {
        try {
          const res = await saveAssignments({ week_start_date: start, assignments: weeklyItems })
          if (weekChanged()) return cancelled()
          warnings.value = res.data.warnings ?? []
          outcome.weeklySaved = weeklyItems.length
          handled.push(...weeklyItems.map((item) => item.employee_id))
        } catch (err) {
          if (weekChanged()) return cancelled()
          if (!retried && isRecordedConflict(err)) {
            // 開頁後有人匯入打卡：以最新狀態重算拆分，改走每日調整＋批次確認。
            await reload()
            if (weekChanged()) return cancelled()
            clearHandled(handled)
            if (loadError.value) {
              // 重新載入失敗就不重試（否則會用舊的快照再送一次）。
              outcome.errors.push('排班資料已被更新，但重新載入失敗，請重新整理後再儲存')
              return outcome
            }
            saving.value = false
            const second = await run(true)
            return {
              weeklySaved: second.weeklySaved,
              dailySaved: outcome.dailySaved + second.dailySaved,
              units: [...outcome.units, ...second.units],
              blocked: [...outcome.blocked, ...second.blocked],
              errors: [...outcome.errors, ...second.errors],
            }
          }
          outcome.errors.push(errorMessage(err, '週排班儲存失敗'))
        }
      }
      clearHandled(handled)
      await reload()
      return outcome
    } finally {
      saving.value = false
    }
  }

  const save = (): Promise<SaveOutcome> => run(false)

  return {
    grid,
    loading,
    loadError,
    cells,
    weekDates,
    assignments,
    weeklyEdits,
    pendingCount,
    warnings,
    saving,
    weeklyValue,
    setWeekly,
    discardEdits,
    reload,
    copyFromWeek,
    save,
  }
}

export type ScheduleGridState = ReturnType<typeof useScheduleGrid>
