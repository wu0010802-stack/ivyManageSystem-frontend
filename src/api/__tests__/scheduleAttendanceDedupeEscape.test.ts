import { describe, it, expect, vi, beforeEach } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/index', () => ({ default: http }))

import { getScheduleAttendanceGrid } from '@/api/scheduleAttendance'
import { getAssignments } from '@/api/shifts'
import { getSummary, getAnomalyList } from '@/api/attendance'
import { getAttendanceMonthContext } from '@/api/attendanceMonthContext'

beforeEach(() => { http.get.mockReset().mockResolvedValue({ data: {} }) })

describe('排班與出勤讀取 API：force 走 apiDedupe 逃生口（QA P3）', () => {
  it('沒帶 force 不帶 meta（照常去重）；force=true 帶 meta.allowConcurrent', async () => {
    await getScheduleAttendanceGrid({ start_date: '2026-09-01', end_date: '2026-09-30' })
    expect(http.get).toHaveBeenLastCalledWith('/schedule-attendance/grid', { params: { start_date: '2026-09-01', end_date: '2026-09-30' } })
    await getScheduleAttendanceGrid({ start_date: '2026-09-01', end_date: '2026-09-30' }, { force: true })
    expect(http.get.mock.lastCall?.[1]).toMatchObject({ meta: { allowConcurrent: true } })
    await getAssignments({ week_start: '2026-09-14' }, { force: true })
    expect(http.get.mock.lastCall?.[1]).toMatchObject({ params: { week_start: '2026-09-14' }, meta: { allowConcurrent: true } })
    await getSummary({ year: 2026, month: 9 }, { force: true })
    expect(http.get.mock.lastCall?.[1]).toMatchObject({ meta: { allowConcurrent: true } })
    await getAnomalyList({ year: 2026, month: 9 }, { force: true })
    expect(http.get.mock.lastCall?.[1]).toMatchObject({ meta: { allowConcurrent: true } })
    await getAttendanceMonthContext({ year: 2026, month: 9 }, { force: true })
    expect(http.get.mock.lastCall?.[1]).toMatchObject({ meta: { allowConcurrent: true } })
  })
})
