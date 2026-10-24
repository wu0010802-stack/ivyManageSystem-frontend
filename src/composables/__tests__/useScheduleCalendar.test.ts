import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useScheduleCalendar } from '../useScheduleCalendar'

type Data = { days: { date: string; day: number }[] }
const monthDays = (y: number, m: number): Data => {
  const last = new Date(y, m, 0).getDate()
  return { days: Array.from({ length: last }, (_, i) => ({ date: `${y}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`, day: i + 1 })) }
}

afterEach(() => { vi.useRealTimers() })

describe('useScheduleCalendar', () => {
  it('月曆開頭空格依資料本身的月份計算：query 已換月、資料還是舊月時不錯位', () => {
    // 2026-09-01 週二（空 2 格）；2026-10-01 週四（空 4 格）
    const data = ref<Data | null>(monthDays(2026, 9))
    const { calendarWeeks } = useScheduleCalendar(data, ref(2026), ref(10))
    expect(calendarWeeks.value[0].slice(0, 3).map((d) => d?.day ?? null)).toEqual([null, null, 1])
  })

  it('「今天」在呼叫當下計算（台北日期），不是模組載入時的常數', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T02:00:00Z')) // 台北 10:00
    const { isToday, isFutureDate } = useScheduleCalendar(ref(null), ref(2026), ref(10))
    expect(isToday({ date: '2026-10-19' })).toBe(true)
    vi.setSystemTime(new Date('2026-10-19T16:30:00Z')) // 台北已 10/20 00:30
    expect(isToday({ date: '2026-10-20' })).toBe(true)
    expect(isFutureDate('2026-10-19')).toBe(false)
  })
})
