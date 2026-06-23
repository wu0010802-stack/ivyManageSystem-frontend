/**
 * 家長端才藝課「上課時段 / 適齡 / 衝堂偵測」純函式。
 *
 * 資料來源：後端 list_courses / my-registrations 已曝露 meeting_weekday(0=Mon..6=Sun)、
 * meeting_start_time / meeting_end_time（"HH:MM"）、min_age_months / max_age_months。
 * 衝堂為前台 advisory（model 設計：警告不擋報名），故全部判定在前端純函式完成。
 */

export interface CourseSlot {
  meeting_weekday?: number | null
  meeting_start_time?: string | null
  meeting_end_time?: string | null
}

export interface CatalogCourseSlot extends CourseSlot {
  id: number
}

const WEEKDAY_LABELS = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']

/** meeting_weekday(0=Mon..6=Sun) → '週一'..'週日'；非法/缺值 → ''。 */
export function formatWeekday(weekday?: number | null): string {
  if (weekday == null || weekday < 0 || weekday > 6) return ''
  return WEEKDAY_LABELS[weekday]
}

/** ('15:30','16:30') → '15:30–16:30'；缺任一端 → ''（時段不完整不顯示）。 */
export function formatTimeRange(start?: string | null, end?: string | null): string {
  if (!start || !end) return ''
  return `${start}–${end}`
}

function monthsToAge(months: number): string {
  const years = months / 12
  // 整數歲不帶小數；否則保留一位（例：30 個月 → 2.5 歲）
  return Number.isInteger(years) ? String(years) : years.toFixed(1)
}

/**
 * (min_age_months, max_age_months) → 適齡字串（歲）。
 * 皆有 → '3–6 歲'；只有下限 → '3 歲以上'；只有上限 → '6 歲以下'；皆無 → ''。
 */
export function formatAgeRange(
  minMonths?: number | null,
  maxMonths?: number | null,
): string {
  const hasMin = minMonths != null
  const hasMax = maxMonths != null
  if (hasMin && hasMax) return `${monthsToAge(minMonths!)}–${monthsToAge(maxMonths!)} 歲`
  if (hasMin) return `${monthsToAge(minMonths!)} 歲以上`
  if (hasMax) return `${monthsToAge(maxMonths!)} 歲以下`
  return ''
}

/**
 * 兩課程時段是否衝突：同星期 + 時間區間重疊（相接邊界不算重疊）。
 * 任一缺 weekday 或起訖時間 → 無法判定，回 false（不誤報）。
 * "HH:MM" 為零補位字串，字典序即時間序，可直接比較。
 */
export function hasScheduleConflict(a: CourseSlot, b: CourseSlot): boolean {
  if (a.meeting_weekday == null || b.meeting_weekday == null) return false
  if (a.meeting_weekday !== b.meeting_weekday) return false
  if (!a.meeting_start_time || !a.meeting_end_time) return false
  if (!b.meeting_start_time || !b.meeting_end_time) return false
  return a.meeting_start_time < b.meeting_end_time && b.meeting_start_time < a.meeting_end_time
}

/** 已佔位狀態（與後端 OCCUPYING_STATUSES 對齊）：候補不算佔時段。 */
export const OCCUPYING_STATUSES = ['enrolled', 'promoted_pending']

interface RegistrationLike {
  courses?: Array<CourseSlot & { status?: string }>
}

/** 從家長報名清單抽出「已佔位課程」的時段，供衝堂比對。 */
export function collectBusySlots(
  regs: RegistrationLike[],
  statuses: string[] = OCCUPYING_STATUSES,
): CourseSlot[] {
  const slots: CourseSlot[] = []
  for (const reg of regs || []) {
    for (const c of reg?.courses || []) {
      if (c.status && statuses.includes(c.status)) {
        slots.push({
          meeting_weekday: c.meeting_weekday,
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
