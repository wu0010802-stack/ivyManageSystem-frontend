import { describe, it, expect } from 'vitest'
import { computed, ref } from 'vue'
import { buildGridVerdictLookup } from '../useGridVerdict'
import type { MonthGridState } from '../useMonthGrid'
import { detectAttendancePatterns } from '@/utils/attendancePatterns'
import { indexCells, type GridOut } from '@/utils/scheduleAttendanceGrid'
import { cell, day, employee, grid } from '@/components/schedule-attendance/__tests__/gridFixtures'

function monthOf(g: GridOut | null): MonthGridState {
  const data = ref(g)
  return {
    data,
    cells: computed(() => indexCells(data.value?.cells ?? [])),
    patterns: computed(() => (data.value ? detectAttendancePatterns(data.value) : [])),
  } as unknown as MonthGridState
}

describe('buildGridVerdictLookup（出勤明細借用班表核對的判定）', () => {
  it('回傳格子上的判定文字與狀態；沒有這格、沒有打卡資料、整月資料還沒到都是 null', () => {
    const g = grid({ days: [day('2026-09-14')], employees: [employee(1, '呂麗珍')], today: '2026-09-21', cells: [cell(1, '2026-09-14', { actual: { status: 'possible_shift_change', late_minutes: 24 } })] })
    const lookup = buildGridVerdictLookup(monthOf(g)).value
    expect(lookup(1, '2026-09-14')).toMatchObject({ label: '疑似換班', status: 'possible_shift_change', acceptWarning: null })
    expect(lookup(1, '2026-09-15')).toBeNull()
    expect(lookup(null, '2026-09-14')).toBeNull()
    // 異常清單的日卡只有員工編號
    const g2 = grid({ days: [day('2026-09-14')], employees: [employee(1, '呂麗珍', { employee_number: 'E007' })], today: '2026-09-21', cells: [cell(1, '2026-09-14', { actual: { status: 'possible_shift_change' } })] })
    expect(buildGridVerdictLookup(monthOf(g2)).value(null, '2026-09-14', 'E007')?.status).toBe('possible_shift_change')
    expect(buildGridVerdictLookup(monthOf(g2)).value(null, '2026-09-14', 'E999')).toBeNull()
    expect(buildGridVerdictLookup(monthOf(null)).value(1, '2026-09-14')).toBeNull()
  })

  it('符合整月固定型態的格子帶接受扣款前的提醒', () => {
    const dates = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21', '2026-09-22']
    const g = grid({
      days: dates.map((d) => day(d)),
      employees: [employee(1, '黃毓慧')],
      today: '2026-09-28',
      cells: dates.map((d) => cell(1, d, { plan: { source: 'employee', name: null, shift_type_id: null, work_start: '08:00', work_end: '17:00' }, actual: { status: 'anomaly', punch_in: `${d}T08:57:00`, punch_out: `${d}T11:18:00`, late_minutes: 57, early_leave_minutes: 342 } })),
    })
    const verdict = buildGridVerdictLookup(monthOf(g)).value(1, '2026-09-14')
    expect(verdict?.acceptWarning).toContain('黃毓慧 本月')
  })
})
