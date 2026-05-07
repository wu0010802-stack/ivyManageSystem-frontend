import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useScheduleCalendar } from '@/composables/useScheduleCalendar'

describe('useScheduleCalendar', () => {
  it('returns empty weeks when scheduleData is null', () => {
    const data = ref(null)
    const year = ref(2026)
    const month = ref(5)
    const { calendarWeeks } = useScheduleCalendar(data, year, month)
    expect(calendarWeeks.value).toEqual([])
  })

  it('builds 7 columns per week with leading null padding', () => {
    // 2026-05-01 是週五 → 前面要 5 個 null（週日=0, 週一=1, ... 週四=4 共 5 cells）
    const data = ref({
      days: [
        { date: '2026-05-01', day: 1, weekday: '週五' },
        { date: '2026-05-02', day: 2, weekday: '週六' },
      ],
    })
    const year = ref(2026)
    const month = ref(5)
    const { calendarWeeks } = useScheduleCalendar(data, year, month)

    expect(calendarWeeks.value.length).toBeGreaterThan(0)
    const firstWeek = calendarWeeks.value[0]
    expect(firstWeek.length).toBe(7)
    expect(firstWeek[0]).toBe(null)
    expect(firstWeek[4]).toBe(null)
    expect(firstWeek[5]).toEqual({ date: '2026-05-01', day: 1, weekday: '週五' })
  })

  it('pads end of last week with null', () => {
    const data = ref({
      days: Array.from({ length: 31 }, (_, i) => ({
        date: `2026-05-${String(i + 1).padStart(2, '0')}`,
        day: i + 1,
      })),
    })
    const year = ref(2026)
    const month = ref(5)
    const { calendarWeeks } = useScheduleCalendar(data, year, month)

    const lastWeek = calendarWeeks.value[calendarWeeks.value.length - 1]
    expect(lastWeek.length).toBe(7)
    // 31 May 2026 is Sunday → only first cell of last week has data
    expect(lastWeek[0]).toEqual(expect.objectContaining({ day: 31 }))
    expect(lastWeek[1]).toBe(null)
  })

  it('isToday returns true for today day', () => {
    const data = ref(null)
    const year = ref(2026)
    const month = ref(5)
    const { isToday } = useScheduleCalendar(data, year, month)

    const t = new Date()
    const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    expect(isToday({ date: todayStr })).toBe(true)
    expect(isToday({ date: '1990-01-01' })).toBe(false)
    expect(isToday(null)).toBe(false)
  })

  it('isFutureDate returns true for today and after', () => {
    const data = ref(null)
    const year = ref(2026)
    const month = ref(5)
    const { isFutureDate } = useScheduleCalendar(data, year, month)

    const t = new Date()
    const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    expect(isFutureDate(todayStr)).toBe(true)
    expect(isFutureDate('1990-01-01')).toBe(false)
  })

  it('calendarWeeks reactive to data changes', () => {
    const data = ref(null)
    const year = ref(2026)
    const month = ref(5)
    const { calendarWeeks } = useScheduleCalendar(data, year, month)
    expect(calendarWeeks.value).toEqual([])

    data.value = { days: [{ date: '2026-05-01', day: 1 }] }
    expect(calendarWeeks.value.length).toBeGreaterThan(0)
  })
})
