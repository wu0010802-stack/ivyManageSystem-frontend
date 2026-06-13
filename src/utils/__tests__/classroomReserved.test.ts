import { describe, it, expect } from 'vitest'
import { mapReservedByGrade, reservedCountFor } from '@/utils/classroomReserved'

describe('班級卡準新生保留數', () => {
  it('mapReservedByGrade 把 intake-plan rows 轉成 grade_id → reserved_count', () => {
    expect(
      mapReservedByGrade([
        { grade_id: 1, reserved_count: 3 },
        { grade_id: 2, reserved_count: 0 },
      ]),
    ).toEqual({ 1: 3, 2: 0 })
  })

  it('reservedCountFor 以班級 grade_id 查表，無年級或無資料回 0', () => {
    const map = { 1: 3 }
    expect(reservedCountFor(map, { grade_id: 1 })).toBe(3)
    expect(reservedCountFor(map, { grade_id: 9 })).toBe(0)
    expect(reservedCountFor(map, { grade_id: null })).toBe(0)
    expect(reservedCountFor(map, {})).toBe(0)
  })
})
