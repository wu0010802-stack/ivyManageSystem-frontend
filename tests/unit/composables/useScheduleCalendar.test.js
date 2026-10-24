import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

  describe('「今天」以台北日期為準', () => {
    // UTC 2026-05-10 20:00 ＝ 台北 2026-05-11 04:00：UTC 機器（CI）上本機日期與台北日期不同
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-10T20:00:00Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('isToday returns true for today day', () => {
      const data = ref(null)
      const year = ref(2026)
      const month = ref(5)
      const { isToday } = useScheduleCalendar(data, year, month)

      expect(isToday({ date: '2026-05-11' })).toBe(true)
      expect(isToday({ date: '2026-05-10' })).toBe(false) // UTC 日期不算今天
      expect(isToday({ date: '1990-01-01' })).toBe(false)
      expect(isToday(null)).toBe(false)
    })

    it('isFutureDate returns true for today and after', () => {
      const data = ref(null)
      const year = ref(2026)
      const month = ref(5)
      const { isFutureDate } = useScheduleCalendar(data, year, month)

      expect(isFutureDate('2026-05-11')).toBe(true)
      expect(isFutureDate('2026-05-12')).toBe(true)
      expect(isFutureDate('2026-05-10')).toBe(false) // 台北已跨日，UTC 日期算過去
      expect(isFutureDate('1990-01-01')).toBe(false)
    })
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
