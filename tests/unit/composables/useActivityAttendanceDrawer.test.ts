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

describe('useActivityAttendanceDrawer isDirty 未存變更守衛', () => {
  function makeSession() {
    return {
      id: 1, course_name: '圍棋', session_date: '2026-05-29',
      students: [
        { registration_id: 1, class_name: 'A班', is_present: null, attendance_notes: '', student_name: 'a1' },
        { registration_id: 2, class_name: 'A班', is_present: true, attendance_notes: '遲到', student_name: 'a2' },
      ],
    }
  }

  it('開啟後未改動 → isDirty 為 false', async () => {
    const drawer = useActivityAttendanceDrawer({
      getSessionFn: async () => ({ data: makeSession() }),
      updateFn: async () => ({}),
    })
    await drawer.openDrawer({ id: 1 })
    expect(drawer.isDirty()).toBe(false)
  })

  it('改 is_present → isDirty 為 true', async () => {
    const drawer = useActivityAttendanceDrawer({
      getSessionFn: async () => ({ data: makeSession() }),
      updateFn: async () => ({}),
    })
    await drawer.openDrawer({ id: 1 })
    drawer.drawerSession.value.students[0].is_present = true
    expect(drawer.isDirty()).toBe(true)
  })

  it('改 attendance_notes → isDirty 為 true', async () => {
    const drawer = useActivityAttendanceDrawer({
      getSessionFn: async () => ({ data: makeSession() }),
      updateFn: async () => ({}),
    })
    await drawer.openDrawer({ id: 1 })
    drawer.drawerSession.value.students[1].attendance_notes = '改備註'
    expect(drawer.isDirty()).toBe(true)
  })

  it('handleSave 成功後重置快照 → isDirty 回 false', async () => {
    const drawer = useActivityAttendanceDrawer({
      getSessionFn: async () => ({ data: makeSession() }),
      updateFn: async () => ({}),
    })
    await drawer.openDrawer({ id: 1 })
    drawer.drawerSession.value.students[0].is_present = false
    expect(drawer.isDirty()).toBe(true)
    await drawer.handleSave()
    expect(drawer.isDirty()).toBe(false)
  })

  it('reloadCurrentSession 後以新資料為基準 → isDirty 為 false', async () => {
    let call = 0
    const drawer = useActivityAttendanceDrawer({
      getSessionFn: async () => {
        call += 1
        // 第二次回傳已有人出席的資料，模擬伺服器最新狀態
        const s = makeSession()
        if (call > 1) s.students[0].is_present = true
        return { data: s }
      },
      updateFn: async () => ({}),
    })
    await drawer.openDrawer({ id: 1 })
    await drawer.reloadCurrentSession()
    expect(drawer.isDirty()).toBe(false)
  })

  it('drawerSession 為 null 時 isDirty 為 false（不爆）', async () => {
    const drawer = useActivityAttendanceDrawer({
      getSessionFn: async () => ({ data: makeSession() }),
      updateFn: async () => ({}),
    })
    expect(drawer.isDirty()).toBe(false)
  })
})
