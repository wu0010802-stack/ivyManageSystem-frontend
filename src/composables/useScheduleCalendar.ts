import { computed, type Ref } from 'vue'
import { todayTaipeiISO } from '@/utils/format'

/**
 * 排班月曆計算 helper。
 *
 * @param {import('vue').Ref<{days: Array<{date: string, day: number, weekday?: string}>}|null>} scheduleData reactive ref，含 .days array
 * @param {import('vue').Ref<number>} year reactive ref
 * @param {import('vue').Ref<number>} month reactive ref（1-12）
 *
 * @returns {{
 *   calendarWeeks: import('vue').ComputedRef<Array<Array<{date: string, day: number}|null>>>,
 *   isToday: (day: {date: string}|null) => boolean,
 *   isFutureDate: (dateStr: string) => boolean,
 * }}
 */
export function useScheduleCalendar(scheduleData: Ref<{ days: { date: string; day: number; weekday?: string }[] } | null | undefined>, year: Ref<number>, month: Ref<number>) {
  const calendarWeeks = computed(() => {
    if (!scheduleData.value) return []
    const days = scheduleData.value.days
    // 開頭空格以資料本身的月份算：換月時 query 先變、資料還是舊月，不能用 query 的年月錯位
    const [y, m] = days[0]?.date ? days[0].date.split('-').map(Number) : [year.value, month.value]
    const firstDate = new Date(y, m - 1, 1)
    const startWeekday = firstDate.getDay() // 0=Sun

    const padded = []
    for (let i = 0; i < startWeekday; i++) padded.push(null)
    for (const d of days) padded.push(d)
    while (padded.length % 7 !== 0) padded.push(null)

    const weeks = []
    for (let i = 0; i < padded.length; i += 7) {
      weeks.push(padded.slice(i, i + 7))
    }
    return weeks
  })

  // 「今天」在呼叫當下算（台北日期）：頁面開過午夜不能還停在載入那天
  const isToday = (day: { date: string } | null) => !!day && day.date === todayTaipeiISO()
  const isFutureDate = (dateStr: string) => dateStr >= todayTaipeiISO()

  return { calendarWeeks, isToday, isFutureDate }
}
