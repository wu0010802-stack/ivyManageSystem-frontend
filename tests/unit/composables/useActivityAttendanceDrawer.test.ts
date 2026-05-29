import { describe, it, expect, vi } from 'vitest'

// ── Element Plus mocks ─────────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// ────────────────────────────────────────────────────────────────── //

import { useActivityAttendanceDrawer } from '@/composables/useActivityAttendanceDrawer'

describe('useActivityAttendanceDrawer sortedStudents', () => {
  it('依班級聚集，班級內未點名優先', async () => {
    const sessionData = {
      id: 1, course_name: '圍棋', session_date: '2026-05-29',
      students: [
        { registration_id: 1, class_name: 'B班', is_present: true, student_name: 'b1' },
        { registration_id: 2, class_name: 'A班', is_present: true, student_name: 'a1' },
        { registration_id: 3, class_name: 'A班', is_present: null, student_name: 'a2' },
      ],
    }
    const drawer = useActivityAttendanceDrawer({
      getSessionFn: async () => ({ data: sessionData }),
      updateFn: async () => ({}),
    })
    await drawer.openDrawer({ id: 1 })
    const order = drawer.sortedStudents.value.map((s) => s.registration_id)
    // A班 在 B班 前；A班內未點名(a2,id=3)在已點名(a1,id=2)前
    expect(order).toEqual([3, 2, 1])
  })
})
