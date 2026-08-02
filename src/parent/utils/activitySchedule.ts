/**
 * 家長端才藝課「上課時段 / 衝堂偵測」純函式。
 *
 * 資料來源：後端 list_courses / my-registrations 已曝露 meeting_weekdays
 * （複選陣列，0=Mon..6=Sun；actwkdays01）、meeting_start_time /
 * meeting_end_time（"HH:MM"）。衝堂為前台 advisory（model 設計：警告不擋報名），
 * 故全部判定在前端純函式完成；星期標籤/交集判定委派 @/utils/weekdaySchedule。
 */

import {
  formatWeekdays,
  weekdaySchedulesOverlap,
  type WeekdaySlot,
} from '../../utils/weekdaySchedule'

export type CourseSlot = WeekdaySlot

export interface CatalogCourseSlot extends CourseSlot {
  id: number
}

export { formatWeekdays }

/** ('15:30','16:30') → '15:30–16:30'；缺任一端 → ''（時段不完整不顯示）。 */
export function formatTimeRange(start?: string | null, end?: string | null): string {
  if (!start || !end) return ''
  return `${start}–${end}`
}

/**
 * 兩課程時段是否衝突：星期集合有交集 + 時間區間重疊（相接邊界不算重疊）。
 * 任一缺星期或起訖時間 → 無法判定，回 false（不誤報）。
 */
export function hasScheduleConflict(a: CourseSlot, b: CourseSlot): boolean {
  return weekdaySchedulesOverlap(a, b)
}

/** 已佔位狀態（與後端 OCCUPYING_STATUSES 對齊）：候補不算佔時段。 */
export const OCCUPYING_STATUSES = ['enrolled', 'promoted_pending']

interface RegistrationLike {
  school_year?: number | null
  semester?: number | null
  courses?: Array<CourseSlot & { status?: string }>
}

interface CollectBusyOptions {
  /** 指定學年/學期 → 只收該學期的報名（防跨學期誤報，code review #6）。 */
  schoolYear?: number | null
  semester?: number | null
  statuses?: string[]
}

/** 從家長報名清單抽出「已佔位課程」的時段，供衝堂比對。
 *
 * code review #6：my-registrations 回所有學期的 active 報名；若不過濾，上學期課程
 * 會讓本學期同星期/時段的課程誤報衝堂。傳入 schoolYear+semester 時只收該學期；
 * 未傳則維持舊行為（不過濾，向後相容）。 */
export function collectBusySlots(
  regs: RegistrationLike[],
  opts: CollectBusyOptions = {},
): CourseSlot[] {
  const { schoolYear, semester, statuses = OCCUPYING_STATUSES } = opts
  const filterTerm = schoolYear != null && semester != null
  const slots: CourseSlot[] = []
  for (const reg of regs || []) {
    if (filterTerm && (reg.school_year !== schoolYear || reg.semester !== semester)) {
      continue
    }
    for (const c of reg?.courses || []) {
      if (c.status && statuses.includes(c.status)) {
        slots.push({
          meeting_weekdays: c.meeting_weekdays,
          meeting_start_time: c.meeting_start_time,
          meeting_end_time: c.meeting_end_time,
        })
      }
    }
  }
  return slots
}

/** 目錄課程中與任一已佔位時段衝突者的 id 集合。 */
export function buildConflictCourseIds(
  catalog: CatalogCourseSlot[],
  busy: CourseSlot[],
): Set<number> {
  const ids = new Set<number>()
  for (const course of catalog || []) {
    if ((busy || []).some((slot) => hasScheduleConflict(course, slot))) {
      ids.add(course.id)
    }
  }
  return ids
}

export interface UpcomingSessionLike {
  student_id?: number | null
  session_date?: string | null // "YYYY-MM-DD"
}

/** todayISO 起算 n 天後的 "YYYY-MM-DD"（純函式，不依賴當下時間，便於測試）。 */
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}

/**
 * upcoming-sessions 中落在 [todayISO, todayISO+days] 的場次數（hero「即將開課」用）。
 * studentId 非空時只計該孩子。session_date 為零補位字串，可直接字典序比較。
 */
export function countUpcomingWithinDays(
  sessions: UpcomingSessionLike[],
  { studentId, days, todayISO }: { studentId?: number | null; days: number; todayISO: string },
): number {
  const end = addDaysISO(todayISO, days)
  let count = 0
  for (const s of sessions || []) {
    if (studentId != null && s.student_id !== studentId) continue
    const d = s.session_date
    if (!d) continue
    if (d >= todayISO && d <= end) count++
  }
  return count
}

/** 報名表單用衝堂集合（code review #6）：標記目錄課程中與「既有 busy 時段」或
 * 「其他已勾選課程」衝突者。排除自己（否則課程與自身時段必定重疊變成自衝）。
 * 涵蓋兩個情境：① 與既有報名衝突 ② 本次同時勾選的多門新課互相衝突。 */
export function buildFormConflictCourseIds(
  catalog: CatalogCourseSlot[],
  selectedIds: Iterable<number>,
  existingBusy: CourseSlot[] = [],
): Set<number> {
  const selected = new Set(selectedIds)
  const ids = new Set<number>()
  for (const course of catalog || []) {
    // 與本課程互比的 busy：既有佔位時段 + 其他「已勾選」課程（排除自己）
    const otherSelectedSlots = (catalog || []).filter(
      (c) => c.id !== course.id && selected.has(c.id),
    )
    const busy = [...(existingBusy || []), ...otherSelectedSlots]
    if (busy.some((slot) => hasScheduleConflict(course, slot))) {
      ids.add(course.id)
    }
  }
  return ids
}
