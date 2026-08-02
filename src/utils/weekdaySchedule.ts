/**
 * 才藝課「上課時段」共用純函式（上課星期複選版，BE migration actwkdays01）。
 *
 * 後端自 2026-08-02 起以 `meeting_weekdays: number[]`（0=Mon..6=Sun，排序去重）
 * 表示一門課的多個上課星期，整門課共用同一段 `meeting_start_time` /
 * `meeting_end_time`（"HH:MM"）。本檔是星期標籤與衝堂判定的單一權威——
 * 後台（ActivityCourseView）、公開報名頁（useCourseAdvisory）、家長端
 * （parent/utils/activitySchedule）一律引用此處，勿再各自宣告字面值。
 */

export const WEEKDAY_FULL_LABELS = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']
const WEEKDAY_SHORT_LABELS = ['一', '二', '三', '四', '五', '六', '日']

export interface WeekdaySlot {
  meeting_weekdays?: number[] | null
  meeting_start_time?: string | null
  meeting_end_time?: string | null
}

function validWeekdays(weekdays?: number[] | null): number[] {
  return (weekdays ?? []).filter((d) => d >= 0 && d <= 6)
}

/** [0, 2] → '週一、三'；空/非法 → ''。 */
export function formatWeekdays(weekdays?: number[] | null): string {
  const days = validWeekdays(weekdays)
  if (days.length === 0) return ''
  return `週${days.map((d) => WEEKDAY_SHORT_LABELS[d]).join('、')}`
}

/** 星期＋起訖時間齊備才視為「有時段」（可顯示、可比衝堂）。 */
export function hasWeekdaySchedule(slot?: WeekdaySlot | null): boolean {
  return (
    !!slot &&
    validWeekdays(slot.meeting_weekdays).length > 0 &&
    !!slot.meeting_start_time &&
    !!slot.meeting_end_time
  )
}

/** '週一、三 16:00–17:00'；時段不完整 → ''。 */
export function formatWeekdaySchedule(slot?: WeekdaySlot | null): string {
  if (!slot || !hasWeekdaySchedule(slot)) return ''
  return `${formatWeekdays(slot.meeting_weekdays)} ${slot.meeting_start_time}–${slot.meeting_end_time}`
}

/**
 * 兩課程時段是否衝突：星期集合有交集 + 時間區間重疊（相接邊界不算重疊）。
 * 任一缺星期或起訖時間 → 無法判定，回 false（不誤報）。
 * "HH:MM" 為零補位字串，字典序即時間序，可直接比較。
 */
export function weekdaySchedulesOverlap(a?: WeekdaySlot | null, b?: WeekdaySlot | null): boolean {
  if (!a || !b || !hasWeekdaySchedule(a) || !hasWeekdaySchedule(b)) return false
  const bDays = new Set(validWeekdays(b.meeting_weekdays))
  if (!validWeekdays(a.meeting_weekdays).some((d) => bDays.has(d))) return false
  return (
    (a.meeting_start_time ?? '') < (b.meeting_end_time ?? '') &&
    (b.meeting_start_time ?? '') < (a.meeting_end_time ?? '')
  )
}
