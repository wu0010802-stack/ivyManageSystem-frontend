import { computed } from 'vue'

const _todayStr = (() => {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
})()

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
export function useScheduleCalendar(scheduleData, year, month) {
  const calendarWeeks = computed(() => {
    if (!scheduleData.value) return []
    const days = scheduleData.value.days
    const firstDate = new Date(year.value, month.value - 1, 1)
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

  const isToday = (day) => !!day && day.date === _todayStr
  const isFutureDate = (dateStr) => dateStr >= _todayStr

  return { calendarWeeks, isToday, isFutureDate }
}
