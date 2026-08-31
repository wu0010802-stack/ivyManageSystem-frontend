/**
 * 排班頁請假覆蓋／空班判定純邏輯。
 *
 * 空班語意（2026-08-28，業主選「班別×日自動判定」）：
 * 某班別當日「排定人數 > 0 且 排定 − 請假時段重疊者 歸零」才報空班——
 * 班別當日本來就沒人排（如週末）不報，避免整片噪音。
 * 僅靠 approved 假單就歸零＝empty（確定空班）；
 * 需要算入 pending 才歸零＝risk（待審通過即空班，供預見性排班）。
 *
 * 時間一律 'HH:MM' 字串比較（字典序即時序；'24:00' 作為日終哨兵）。
 */

export interface LeaveContextItem {
  id: number
  employee_id: number
  employee_name: string
  leave_type: string
  leave_type_label: string
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  status: string
}

export interface CoverageShiftType {
  id: number
  name: string
  work_start: string
  work_end: string
}

export interface AbsenceWindow {
  start: string
  end: string
}

export interface DailyOverrideLike {
  employee_id: number
  date: string
  shift_type_id: number | null
}

export interface DayLeaveEntry {
  leave: LeaveContextItem
  window: AbsenceWindow
}

export interface ShiftGap {
  shiftTypeId: number
  shiftTypeName: string
  workStart: string
  workEnd: string
  scheduledCount: number
  absentNames: string[]
  severity: 'empty' | 'risk'
}

export interface DayCoverage {
  date: string
  leaves: DayLeaveEntry[]
  gaps: ShiftGap[]
}

/** 該假單在指定日期的缺席時窗；日期不在假單範圍回 null。 */
export function leaveWindowForDate(
  leave: Pick<LeaveContextItem, 'start_date' | 'end_date' | 'start_time' | 'end_time'>,
  dateISO: string
): AbsenceWindow | null {
  if (dateISO < leave.start_date || dateISO > leave.end_date) return null
  return {
    start: dateISO === leave.start_date ? leave.start_time || '00:00' : '00:00',
    end: dateISO === leave.end_date ? leave.end_time || '24:00' : '24:00',
  }
}

/** 該假單是否讓員工在指定日期缺席該班別（時窗與班別時段有交集；邊界相接不算）。 */
export function leaveCoversShift(
  leave: Pick<LeaveContextItem, 'start_date' | 'end_date' | 'start_time' | 'end_time'>,
  dateISO: string,
  shift: Pick<CoverageShiftType, 'work_start' | 'work_end'>
): boolean {
  const win = leaveWindowForDate(leave, dateISO)
  if (!win) return false
  return win.start < shift.work_end && win.end > shift.work_start
}

export function computeWeekCoverage(opts: {
  dates: string[]
  /** 排班對象（本頁可排的員工）；清單外員工的請假只列清單、不進空班計算 */
  employeeIds: number[]
  weeklyShiftByEmp: Record<number, number | null>
  dailyOverrides: DailyOverrideLike[]
  shiftTypes: CoverageShiftType[]
  leaves: LeaveContextItem[]
}): DayCoverage[] {
  const { dates, employeeIds, weeklyShiftByEmp, dailyOverrides, shiftTypes, leaves } = opts

  const overrideByEmpDate = new Map<string, number | null>()
  for (const o of dailyOverrides) {
    overrideByEmpDate.set(`${o.employee_id}:${o.date}`, o.shift_type_id)
  }

  const leavesByEmp = new Map<number, LeaveContextItem[]>()
  for (const lv of leaves) {
    const list = leavesByEmp.get(lv.employee_id)
    if (list) list.push(lv)
    else leavesByEmp.set(lv.employee_id, [lv])
  }

  return dates.map((date) => {
    const dayLeaves: DayLeaveEntry[] = []
    for (const lv of leaves) {
      const window = leaveWindowForDate(lv, date)
      if (window) dayLeaves.push({ leave: lv, window })
    }

    // 當日有效排班：每日調整優先（shift_type_id=null＝明確排休），否則週指派
    const scheduledByShift = new Map<number, number[]>()
    for (const empId of employeeIds) {
      const key = `${empId}:${date}`
      const shiftId = overrideByEmpDate.has(key)
        ? overrideByEmpDate.get(key)!
        : weeklyShiftByEmp[empId] ?? null
      if (shiftId == null) continue
      const list = scheduledByShift.get(shiftId)
      if (list) list.push(empId)
      else scheduledByShift.set(shiftId, [empId])
    }

    const gaps: ShiftGap[] = []
    for (const st of shiftTypes) {
      const scheduled = scheduledByShift.get(st.id) ?? []
      if (scheduled.length === 0) continue

      // 依員工去重（同人同日多筆假單只算一次缺席）
      const absentApproved = new Set<number>()
      const absentAny = new Set<number>()
      const nameByEmp = new Map<number, string>()
      for (const empId of scheduled) {
        for (const lv of leavesByEmp.get(empId) ?? []) {
          if (!leaveCoversShift(lv, date, st)) continue
          absentAny.add(empId)
          nameByEmp.set(empId, lv.employee_name)
          if (lv.status === 'approved') absentApproved.add(empId)
        }
      }

      if (scheduled.length - absentAny.size > 0) continue
      gaps.push({
        shiftTypeId: st.id,
        shiftTypeName: st.name,
        workStart: st.work_start,
        workEnd: st.work_end,
        scheduledCount: scheduled.length,
        absentNames: scheduled
          .filter((id) => absentAny.has(id))
          .map((id) => nameByEmp.get(id) ?? String(id)),
        severity: scheduled.length - absentApproved.size === 0 ? 'empty' : 'risk',
      })
    }

    return { date, leaves: dayLeaves, gaps }
  })
}
